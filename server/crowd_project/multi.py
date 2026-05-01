from ultralytics import YOLO
import cv2
import csv
from datetime import datetime
import os

# ========== SETTINGS ==========
VIDEO_FILES = ["video1.mp4", "video2.mp4", "video3.mp4"]
WINDOW_NAME = "AI Crowd Intelligence System"
FRAME_W, FRAME_H = 400, 300
CONF_THRESHOLD = 0.15
UPSCALE = 2.0
IMG_SIZE = 960
# ==============================

model = YOLO("yolov8n.pt")

caps = [cv2.VideoCapture(v) for v in VIDEO_FILES]

csv_file = open("multi_data.csv", "w", newline="")
writer = csv.writer(csv_file)
writer.writerow(["Time", "Area A", "Area B", "Area C", "Best Route"])

def get_density(count):
    if count < 10:
        return "LOW"
    elif count < 25:
        return "MEDIUM"
    else:
        return "HIGH"

def process(frame):
    frame = cv2.resize(frame, None, fx=UPSCALE, fy=UPSCALE)

    count = 0
    results = model(frame, conf=CONF_THRESHOLD, imgsz=IMG_SIZE)

    for r in results:
        for box in r.boxes:
            if int(box.cls[0]) == 0:
                conf = float(box.conf[0])

                if conf < 0.15:
                    continue

                count += 1
                x1, y1, x2, y2 = map(int, box.xyxy[0])

                cv2.rectangle(frame, (x1,y1), (x2,y2), (0,255,0), 2)
                label = f"{conf:.2f}"
                cv2.putText(frame, label, (x1, y1-5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0,255,0), 1)

    return frame, count

def play_alert():
    os.system('afplay /System/Library/Sounds/Glass.aiff')

alert_triggered = False

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

    if len(frames) != 3:
        break

    densities = [get_density(c) for c in counts]
    best = counts.index(min(counts)) + 1

    frames = [cv2.resize(f, (FRAME_W, FRAME_H)) for f in frames]

    labels = ["A", "B", "C"]
    for i in range(3):
        cv2.putText(frames[i], f"{labels[i]}: {counts[i]} ({densities[i]})",
                    (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)

    top = cv2.hconcat([frames[0], frames[1]])
    blank = 255 * frames[0].copy()
    bottom = cv2.hconcat([frames[2], blank])
    combined = cv2.vconcat([top, bottom])

    alert = "NORMAL"
    if "HIGH" in densities:
        alert = "OVERCROWDING RISK"

    if alert == "OVERCROWDING RISK" and not alert_triggered:
        play_alert()
        alert_triggered = True
    elif alert == "NORMAL":
        alert_triggered = False

    cv2.putText(combined, f"BEST ROUTE: AREA {best}", (40, 560),
                cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0,0,255), 3)

    cv2.putText(combined, f"ALERT: {alert}", (40, 520),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0,0,255), 2)

    cv2.putText(combined, "SYSTEM ACTIVE", (850, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)

    current_time = datetime.now().strftime("%H:%M:%S")
    writer.writerow([current_time, counts[0], counts[1], counts[2], best])

    cv2.imshow(WINDOW_NAME, combined)

    if cv2.waitKey(1) & 0xFF == 27:
        break

for cap in caps:
    cap.release()

csv_file.close()
cv2.destroyAllWindows()
