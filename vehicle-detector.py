#!/usr/bin/env python3

"""
Vehicle Detection Service
Detects vehicles entering/exiting parking lot using YOLOv8 on Hailo-8L
"""

import cv2
import numpy as np
import json
import time
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional

# Try to import Hailo SDK
try:
    from hailo_platform import (VDevice, HailoStreamInterface, InferVStreams,
                                 ConfigureParams, InputVStreamParams, OutputVStreamParams,
                                 FormatType)
    HAILO_AVAILABLE = True
except ImportError:
    print("⚠️  WARNING: Hailo SDK not available - running in mock mode")
    HAILO_AVAILABLE = False

# Configuration from environment variables
PI_ID = os.getenv('PI_ID', 'blue-gate-pi')
GATE_LOCATION = os.getenv('GATE_LOCATION', 'entrance-1')
DETECTION_LINE_Y = int(os.getenv('DETECTION_LINE_Y', '540'))  # Middle of 1080p
MIN_CONFIDENCE = float(os.getenv('MIN_CONFIDENCE', '0.7'))
FRAME_RATE = int(os.getenv('FRAME_RATE', '24'))
CAMERA_WIDTH = int(os.getenv('CAMERA_WIDTH', '1920'))
CAMERA_HEIGHT = int(os.getenv('CAMERA_HEIGHT', '1080'))
MODEL_PATH = os.getenv('MODEL_PATH', '/opt/parking-pulse/models/yolov8m.hef')
EVENT_QUEUE_DIR = os.getenv('EVENT_QUEUE_DIR', '/tmp/vehicle-events')
DEBUG_MODE = os.getenv('DEBUG_MODE', 'false').lower() == 'true'

# Ensure event queue directory exists
Path(EVENT_QUEUE_DIR).mkdir(parents=True, exist_ok=True)


class DirectionDetector:
    """
    Detects direction of vehicle travel by tracking centroid across frames
    """

    def __init__(self, detection_line_y: int = 540):
        self.detection_line = detection_line_y
        self.tracks = {}  # {track_id: {'prev_y': int, 'curr_y': int, 'logged': bool, 'first_seen': float}}
        self.track_timeout = 5.0  # Remove tracks after 5 seconds of no updates

    def update(self, track_id: int, centroid_y: int) -> Optional[str]:
        """
        Update track position and detect direction

        Args:
            track_id: Unique identifier for tracked object
            centroid_y: Current Y coordinate of object centroid

        Returns:
            'IN', 'OUT', or None
        """
        current_time = time.time()

        # Initialize new track
        if track_id not in self.tracks:
            self.tracks[track_id] = {
                'prev_y': centroid_y,
                'curr_y': centroid_y,
                'logged': False,
                'first_seen': current_time
            }
            return None

        # Update existing track
        track = self.tracks[track_id]
        track['prev_y'] = track['curr_y']
        track['curr_y'] = centroid_y
        track['first_seen'] = current_time  # Update timestamp

        # Check if crossed detection line (only log once per track)
        if not track['logged']:
            # Crossed from bottom to top (entry into parking lot)
            if track['prev_y'] > self.detection_line and track['curr_y'] <= self.detection_line:
                track['logged'] = True
                return "IN"

            # Crossed from top to bottom (exit from parking lot)
            elif track['prev_y'] < self.detection_line and track['curr_y'] >= self.detection_line:
                track['logged'] = True
                return "OUT"

        return None

    def cleanup_stale_tracks(self):
        """Remove tracks that haven't been updated recently"""
        current_time = time.time()
        stale_tracks = [
            track_id for track_id, track in self.tracks.items()
            if current_time - track['first_seen'] > self.track_timeout
        ]
        for track_id in stale_tracks:
            del self.tracks[track_id]


class SimpleTracker:
    """
    Simple object tracker using IoU (Intersection over Union) matching
    Lightweight alternative to SORT for basic tracking
    """

    def __init__(self, iou_threshold: float = 0.3, max_age: int = 5):
        self.iou_threshold = iou_threshold
        self.max_age = max_age
        self.next_id = 0
        self.tracks = []  # List of {'id': int, 'bbox': [x, y, w, h], 'age': int}

    def update(self, detections: List[Dict]) -> List[Dict]:
        """
        Update tracks with new detections

        Args:
            detections: List of {'bbox': [x, y, w, h], 'confidence': float}

        Returns:
            List of {'id': int, 'bbox': [x, y, w, h], 'confidence': float}
        """
        # Increment age for all tracks
        for track in self.tracks:
            track['age'] += 1

        # Match detections to existing tracks using IoU
        matched_indices = set()
        updated_tracks = []

        for track in self.tracks:
            best_iou = 0
            best_det_idx = None

            for det_idx, detection in enumerate(detections):
                if det_idx in matched_indices:
                    continue

                iou = self._calculate_iou(track['bbox'], detection['bbox'])
                if iou > best_iou and iou > self.iou_threshold:
                    best_iou = iou
                    best_det_idx = det_idx

            if best_det_idx is not None:
                # Update existing track
                detection = detections[best_det_idx]
                updated_tracks.append({
                    'id': track['id'],
                    'bbox': detection['bbox'],
                    'confidence': detection['confidence'],
                    'age': 0  # Reset age
                })
                matched_indices.add(best_det_idx)
            elif track['age'] < self.max_age:
                # Keep track even if not matched (for a few frames)
                updated_tracks.append(track)

        # Create new tracks for unmatched detections
        for det_idx, detection in enumerate(detections):
            if det_idx not in matched_indices:
                updated_tracks.append({
                    'id': self.next_id,
                    'bbox': detection['bbox'],
                    'confidence': detection['confidence'],
                    'age': 0
                })
                self.next_id += 1

        self.tracks = updated_tracks
        return [{'id': t['id'], 'bbox': t['bbox'], 'confidence': t['confidence']}
                for t in self.tracks if t['age'] == 0]

    def _calculate_iou(self, bbox1: List[int], bbox2: List[int]) -> float:
        """Calculate Intersection over Union between two bboxes"""
        x1, y1, w1, h1 = bbox1
        x2, y2, w2, h2 = bbox2

        # Calculate intersection
        x_left = max(x1, x2)
        y_top = max(y1, y2)
        x_right = min(x1 + w1, x2 + w2)
        y_bottom = min(y1 + h1, y2 + h2)

        if x_right < x_left or y_bottom < y_top:
            return 0.0

        intersection_area = (x_right - x_left) * (y_bottom - y_top)

        # Calculate union
        bbox1_area = w1 * h1
        bbox2_area = w2 * h2
        union_area = bbox1_area + bbox2_area - intersection_area

        return intersection_area / union_area if union_area > 0 else 0.0


class HailoYOLOv8Detector:
    """
    YOLOv8 object detector using Hailo-8L hardware acceleration
    """

    def __init__(self, model_path: str):
        self.model_path = model_path
        self.device = None
        self.network_group = None
        self.input_vstreams = None
        self.output_vstreams = None

        if HAILO_AVAILABLE:
            self._initialize_hailo()
        else:
            print("⚠️  Running in mock mode - Hailo SDK not available")

    def _initialize_hailo(self):
        """Initialize Hailo device and load model"""
        try:
            print(f"🔧 Initializing Hailo device...")

            # Create VDevice (represents Hailo-8L)
            self.device = VDevice()

            # Load HEF (Hailo Executable Format) model
            print(f"📦 Loading model: {self.model_path}")
            hef = self.device.create_hef(self.model_path)

            # Configure network group
            configure_params = ConfigureParams.create_from_hef(hef, interface=HailoStreamInterface.PCIe)
            self.network_group = self.device.configure(hef, configure_params)[0]

            print("✅ Hailo device initialized successfully")
            print(f"   Network: {self.network_group.name}")

        except Exception as e:
            print(f"❌ Failed to initialize Hailo: {e}")
            print("   Falling back to mock mode")
            HAILO_AVAILABLE = False

    def detect(self, frame: np.ndarray, confidence_threshold: float = 0.7) -> List[Dict]:
        """
        Run detection on frame

        Args:
            frame: Input image (BGR)
            confidence_threshold: Minimum confidence for detections

        Returns:
            List of detections: [{'bbox': [x, y, w, h], 'confidence': float, 'class': str}]
        """
        if not HAILO_AVAILABLE:
            return self._mock_detect(frame, confidence_threshold)

        # Preprocess frame for YOLOv8
        input_data = self._preprocess(frame)

        # Run inference on Hailo
        with InferVStreams(self.network_group, InputVStreamParams(), OutputVStreamParams()) as infer_pipeline:
            output_data = infer_pipeline.infer({self.input_vstreams[0].name: input_data})

        # Post-process detections
        detections = self._postprocess(output_data, frame.shape, confidence_threshold)

        return detections

    def _preprocess(self, frame: np.ndarray) -> np.ndarray:
        """Preprocess frame for YOLOv8 input"""
        # Resize to model input size (typically 640x640 for YOLOv8)
        input_size = (640, 640)
        resized = cv2.resize(frame, input_size)

        # Normalize and convert to float32
        normalized = resized.astype(np.float32) / 255.0

        # Convert BGR to RGB
        rgb = cv2.cvtColor(normalized, cv2.COLOR_BGR2RGB)

        # Add batch dimension and transpose to NCHW format
        input_data = np.transpose(rgb, (2, 0, 1))[np.newaxis, ...]

        return input_data

    def _postprocess(self, output_data: Dict, frame_shape: Tuple, confidence_threshold: float) -> List[Dict]:
        """Post-process Hailo output to get bounding boxes"""
        # This is a simplified post-processing
        # Real implementation would parse YOLO output format
        # and apply NMS (Non-Maximum Suppression)

        detections = []

        # Parse output (format depends on model)
        # Typically: [batch, num_detections, 85] where 85 = x, y, w, h, conf, 80 classes

        # Placeholder - actual implementation would parse Hailo output
        # For now, return empty list

        return detections

    def _mock_detect(self, frame: np.ndarray, confidence_threshold: float) -> List[Dict]:
        """Mock detector for testing without Hailo"""
        # Simulate detection with random vehicles
        if np.random.random() > 0.7:  # 30% chance of detection
            h, w = frame.shape[:2]
            return [{
                'bbox': [
                    int(w * 0.3),
                    int(h * 0.4),
                    int(w * 0.4),
                    int(h * 0.3)
                ],
                'confidence': 0.85 + np.random.random() * 0.10,
                'class': 'car'
            }]
        return []


class VehicleDetectionService:
    """
    Main service for vehicle detection and event generation
    """

    def __init__(self):
        self.detector = HailoYOLOv8Detector(MODEL_PATH)
        self.tracker = SimpleTracker()
        self.direction_detector = DirectionDetector(DETECTION_LINE_Y)
        self.frame_count = 0
        self.event_count = 0
        self.start_time = time.time()

        print("\n" + "="*60)
        print("  🚗 Vehicle Detection Service Starting...")
        print("="*60)
        print(f"  Pi ID: {PI_ID}")
        print(f"  Location: {GATE_LOCATION}")
        print(f"  Detection Line Y: {DETECTION_LINE_Y}")
        print(f"  Min Confidence: {MIN_CONFIDENCE}")
        print(f"  Frame Rate: {FRAME_RATE} FPS")
        print(f"  Resolution: {CAMERA_WIDTH}x{CAMERA_HEIGHT}")
        print(f"  Event Queue: {EVENT_QUEUE_DIR}")
        print(f"  Debug Mode: {DEBUG_MODE}")
        print("="*60 + "\n")

    def start(self):
        """Start vehicle detection service"""
        # Initialize camera
        cap = self._initialize_camera()
        if cap is None:
            print("❌ Failed to initialize camera")
            return

        frame_interval = 1.0 / FRAME_RATE
        last_frame_time = 0

        try:
            while True:
                current_time = time.time()

                # Control frame rate
                if current_time - last_frame_time < frame_interval:
                    time.sleep(0.01)
                    continue

                last_frame_time = current_time

                # Capture frame
                ret, frame = cap.read()
                if not ret:
                    print("⚠️  Failed to capture frame")
                    continue

                self.frame_count += 1

                # Run detection
                detections = self.detector.detect(frame, MIN_CONFIDENCE)

                # Filter for cars only
                car_detections = [d for d in detections if d.get('class') == 'car']

                # Update tracker
                tracked_objects = self.tracker.update(car_detections)

                # Check for direction and generate events
                for obj in tracked_objects:
                    track_id = obj['id']
                    bbox = obj['bbox']

                    # Calculate centroid
                    centroid_x = bbox[0] + bbox[2] // 2
                    centroid_y = bbox[1] + bbox[3] // 2

                    # Update direction detector
                    direction = self.direction_detector.update(track_id, centroid_y)

                    if direction:
                        self._generate_event(
                            track_id=track_id,
                            direction=direction,
                            confidence=obj['confidence'],
                            bbox=bbox,
                            frame=frame
                        )

                # Cleanup stale tracks
                if self.frame_count % 100 == 0:
                    self.direction_detector.cleanup_stale_tracks()

                # Debug visualization
                if DEBUG_MODE:
                    self._visualize_debug(frame, tracked_objects)

                # Print stats periodically
                if self.frame_count % 100 == 0:
                    self._print_stats()

        except KeyboardInterrupt:
            print("\n🛑 Shutting down...")
        finally:
            cap.release()
            if DEBUG_MODE:
                cv2.destroyAllWindows()

    def _initialize_camera(self):
        """Initialize camera capture"""
        print("📷 Initializing camera...")

        # Try different camera backends
        for backend in [cv2.CAP_V4L2, cv2.CAP_ANY]:
            cap = cv2.VideoCapture(0, backend)

            if cap.isOpened():
                # Set resolution
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
                cap.set(cv2.CAP_PROP_FPS, FRAME_RATE)

                # Verify resolution
                actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

                print(f"✅ Camera initialized: {actual_width}x{actual_height}")
                return cap

        return None

    def _generate_event(self, track_id: int, direction: str, confidence: float,
                       bbox: List[int], frame: np.ndarray):
        """Generate event and save to queue"""
        timestamp = int(time.time() * 1000)  # Unix timestamp in milliseconds
        event_id = f"evt_{timestamp}_track{track_id}"

        # Create event data
        event = {
            'eventId': event_id,
            'trackId': track_id,
            'direction': direction,
            'timestamp': timestamp,
            'confidence': round(confidence, 3),
            'bbox': {
                'x': bbox[0],
                'y': bbox[1],
                'width': bbox[2],
                'height': bbox[3]
            },
            'piId': PI_ID,
            'gateLocation': GATE_LOCATION,
            'frameWidth': CAMERA_WIDTH,
            'frameHeight': CAMERA_HEIGHT
        }

        # Save snapshot
        snapshot_path = os.path.join(EVENT_QUEUE_DIR, f"{event_id}.jpg")

        # Draw bounding box on snapshot
        annotated_frame = frame.copy()
        x, y, w, h = bbox
        cv2.rectangle(annotated_frame, (x, y), (x + w, y + h), (0, 255, 0), 3)
        cv2.putText(annotated_frame, f"{direction} - {confidence:.2f}",
                   (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)

        cv2.imwrite(snapshot_path, annotated_frame)
        event['snapshotPath'] = snapshot_path

        # Save event JSON
        event_json_path = os.path.join(EVENT_QUEUE_DIR, f"{event_id}.json")
        with open(event_json_path, 'w') as f:
            json.dump(event, f, indent=2)

        self.event_count += 1

        print(f"🚗 Vehicle {direction}: track_{track_id}, confidence={confidence:.2f}")
        print(f"   Event: {event_id}")
        print(f"   Snapshot: {snapshot_path}")

    def _visualize_debug(self, frame: np.ndarray, tracked_objects: List[Dict]):
        """Visualize debug information"""
        debug_frame = frame.copy()

        # Draw detection line
        cv2.line(debug_frame, (0, DETECTION_LINE_Y),
                (CAMERA_WIDTH, DETECTION_LINE_Y), (0, 0, 255), 2)

        # Draw tracked objects
        for obj in tracked_objects:
            x, y, w, h = obj['bbox']
            cv2.rectangle(debug_frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
            cv2.putText(debug_frame, f"ID:{obj['id']}",
                       (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        # Show frame
        cv2.imshow('Vehicle Detection', cv2.resize(debug_frame, (960, 540)))
        cv2.waitKey(1)

    def _print_stats(self):
        """Print service statistics"""
        uptime = time.time() - self.start_time
        fps = self.frame_count / uptime if uptime > 0 else 0

        print(f"\n📊 Stats: Frames={self.frame_count}, Events={self.event_count}, "
              f"FPS={fps:.1f}, Uptime={uptime:.0f}s\n")


def main():
    """Main entry point"""
    service = VehicleDetectionService()
    service.start()


if __name__ == '__main__':
    main()
