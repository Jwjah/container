from ultralytics import YOLO
import cv2
import csv
from datetime import datetime

# Load stronger model
model = YOLO("yolov8m.pt")

cap = cv2.VideoCapture("crowd.mp4")

# CSV logging
file = open("crowd_data.csv", mode="w", newline="")
writer = csv.writer(file)
writer.writerow(["Time", "People Count", "Density"])

frame_count = 0

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    # Resize for better detection
    frame = cv2.resize(frame, (1280, 720))

    h, w, _ = frame.shape
    mid_x = w // 2

    left_count = 0
    right_count = 0

    # Run YOLO with lower confidence threshold
    results = model(frame, conf=0.25)

    for r in results:
        for box in r.boxes:
            cls = int(box.cls[0])

            # Class 0 = person
            if cls == 0:
                x1, y1, x2, y2 = map(int, box.xyxy[0])

                center_x = (x1 + x2) // 2

                if center_x < mid_x:
                    left_count += 1
                else:
                    right_count += 1

                # Draw box
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0,255,0), 2)

    total = left_count + right_count

    # Density classification
    if total < 15:
        density = "LOW"
    elif total < 40:
        density = "MEDIUM"
    else:
        density = "HIGH"

    # Smart routing
    if left_count > right_count:
        route = "MOVE RIGHT"
    elif right_count > left_count:
        route = "MOVE LEFT"
    else:
        route = "PATH CLEAR"

    # Alert logic
    if density == "HIGH":
        alert = "OVERCROWDING RISK"
    else:
        alert = "NORMAL"

    # Save data
    current_time = datetime.now().strftime("%H:%M:%S")
    writer.writerow([current_time, total, density])

    # Display text
    cv2.putText(frame, f"Total: {total}", (20,40),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0,255,0), 2)

    cv2.putText(frame, f"Left: {left_count}", (20,80),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255,0,0), 2)

    cv2.putText(frame, f"Right: {right_count}", (20,110),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255,0,0), 2)

    cv2.putText(frame, f"Density: {density}", (20,150),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0,0,255), 2)

    cv2.putText(frame, f"Route: {route}", (20,190),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (255,255,0), 2)

    cv2.putText(frame, f"Alert: {alert}", (20,230),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0,0,255), 2)

    # Draw center line
    cv2.line(frame, (mid_x,0), (mid_x,h), (255,255,255), 2)

    # Window
    cv2.imshow("Crowd Intelligence System", frame)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
file.close()
cv2.destroyAllWindows()
