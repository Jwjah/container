from ultralytics import YOLO
import cv2
import csv
from datetime import datetime
import os

# ========== SETTINGS ==========
VIDEO_FILES = ["video3.mp4", "video2.mp4"]
WINDOW_NAME = "AI Crowd Intelligence System (2 Areas)"
FRAME_W, FRAME_H = 500, 350
CONF_THRESHOLD = 0.15
UPSCALE = 2.0
IMG_SIZE = 960
# ==============================

# Load model
model = YOLO("yolov8n.pt")

# Open videos
caps = [cv2.VideoCapture(v) for v in VIDEO_FILES]

# CSV logging
csv_file = open("multi_data_2video.csv", "w", newline="")
writer = csv.writer(csv_file)
writer.writerow(["Time", "Area A", "Area B", "Best Route"])

# Density function
def get_density(count):
    if count < 10:
        return "LOW"
    elif count < 25:
        return "MEDIUM"
    else:
        return "HIGH"

# Detection function
def process(frame):
    frame = cv2.resize(frame, None, fx=UPSCALE, fy=UPSCALE)

    count = 0
    results = model(frame, conf=CONF_THRESHOLD, imgsz=IMG_SIZE)

    for r in results:
        for box in r.boxes:
            if int(box.cls[0]) == 0:  # person
                conf = float(box.conf[0])
                if conf < 0.15:
                    continue

                count += 1
                x1, y1, x2, y2 = map(int, box.xyxy[0])

                # Draw box
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0,255,0), 2)

                # Confidence label
                cv2.putText(frame, f"{conf:.2f}", (x1, y1-5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,0), 1)

    return frame, count

# Mac alert sound
def play_alert():
    os.system('afplay /System/Library/Sounds/Glass.aiff')

alert_triggered = False

# ========== MAIN LOOP ==========
while True:
    frames = []
    counts = []

    for cap in caps:
        ret, frame = cap.read()
        if not ret:
            break

        frame, count = process(frame)
        frames.append(frame)
        counts.append(count)

    if len(frames) != 2:
        break

    # Density
    densities = [get_density(c) for c in counts]

    # Best route (least crowd)
    best = counts.index(min(counts)) + 1

    # Resize frames
    frames = [cv2.resize(f, (FRAME_W, FRAME_H)) for f in frames]

    # Labels
    labels = ["A", "B"]
    for i in range(2):
        cv2.putText(frames[i], f"{labels[i]}: {counts[i]} ({densities[i]})",
                    (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)

    # Combine side-by-side
    combined = cv2.hconcat([frames[0], frames[1]])

    # Alert system
    alert = "NORMAL"
    if "HIGH" in densities:
        alert = "OVERCROWDING RISK"

    if alert == "OVERCROWDING RISK" and not alert_triggered:
        play_alert()
        alert_triggered = True
    elif alert == "NORMAL":
        alert_triggered = False

    # Display info
    cv2.putText(combined, f"BEST ROUTE: AREA {best}", (40, FRAME_H - 20),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0,0,255), 2)

    cv2.putText(combined, f"ALERT: {alert}", (40, FRAME_H - 50),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0,0,255), 2)

    cv2.putText(combined, "SYSTEM ACTIVE", (FRAME_W*2 - 250, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)

    # Log data
    current_time = datetime.now().strftime("%H:%M:%S")
    writer.writerow([current_time, counts[0], counts[1], best])

    # Show window
    cv2.imshow(WINDOW_NAME, combined)

    if cv2.waitKey(1) & 0xFF == 27:
        break

# Cleanup
for cap in caps:
    cap.release()

csv_file.close()
cv2.destroyAllWindows()
