from ultralytics import YOLO
import cv2
import csv
from datetime import datetime
from playsound import playsound

# Load model
model = YOLO("yolov8n.pt")

# Load videos
cap1 = cv2.VideoCapture("video1.mp4")
cap2 = cv2.VideoCapture("video2.mp4")
cap3 = cv2.VideoCapture("video3.mp4")

# CSV logging
file = open("multi_data.csv", mode="w", newline="")
writer = csv.writer(file)
writer.writerow(["Time", "Area A", "Area B", "Area C", "Best Route"])

# Alert control
alert_triggered = False

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
    # Improve detection for small objects
    frame = cv2.resize(frame, None, fx=1.5, fy=1.5)

    count = 0
    results = model(frame, conf=0.25)

    for r in results:
        for box in r.boxes:
            if int(box.cls[0]) == 0:  # person class
                count += 1
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

    return frame, count

# Main loop
while True:
    ret1, f1 = cap1.read()
    ret2, f2 = cap2.read()
    ret3, f3 = cap3.read()

    if not ret1 or not ret2 or not ret3:
        break

    # Process frames
    f1, c1 = process(f1)
    f2, c2 = process(f2)
    f3, c3 = process(f3)

    # Density
    d1 = get_density(c1)
    d2 = get_density(c2)
    d3 = get_density(c3)

    counts = [c1, c2, c3]
    best = counts.index(min(counts)) + 1

    # Resize for display
    f1 = cv2.resize(f1, (400, 300))
    f2 = cv2.resize(f2, (400, 300))
    f3 = cv2.resize(f3, (400, 300))

    # Labels
    cv2.putText(f1, f"A: {c1} ({d1})", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)
    cv2.putText(f2, f"B: {c2} ({d2})", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)
    cv2.putText(f3, f"C: {c3} ({d3})", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)

    # Combine frames
    top = cv2.hconcat([f1, f2])
    blank = 255 * f1.copy()
    bottom = cv2.hconcat([f3, blank])
    combined = cv2.vconcat([top, bottom])

    # Alert system
    alert = "NORMAL"
    if "HIGH" in [d1, d2, d3]:
        alert = "OVERCROWDING RISK"

    # Sound alert (only once)
    if alert == "OVERCROWDING RISK" and not alert_triggered:
        try:
            playsound("alert.mp3")
        except:
            pass
        alert_triggered = True
    elif alert == "NORMAL":
        alert_triggered = False

    # Display main info
    cv2.putText(combined, f"BEST ROUTE: AREA {best}", (40, 570),
                cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0,0,255), 3)

    cv2.putText(combined, f"ALERT: {alert}", (40, 530),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0,0,255), 2)

    cv2.putText(combined, "SYSTEM ACTIVE", (900, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)

    # Log data
    current_time = datetime.now().strftime("%H:%M:%S")
    writer.writerow([current_time, c1, c2, c3, best])

    # Show window
    cv2.imshow("AI Crowd Intelligence System", combined)

    if cv2.waitKey(1) & 0xFF == 27:
        break

# Cleanup
cap1.release()
cap2.release()
cap3.release()
file.close()
cv2.destroyAllWindows()
