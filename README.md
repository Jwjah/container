# 🎓 CampusPrint — The Ultimate Campus Printing Ecosystem

CampusPrint is a professional, full-stack printing management platform designed specifically for university ecosystems. It streamlines the printing process by connecting students directly with campus print shops, featuring a high-end, **AI-powered PDF/Image editor** with OCR capabilities.

![CampusPrint Banner](./campusprint_github_banner.png)

## ✨ Core Features

### 🎨 Pro-Grade PDF & Image Editor
A state-of-the-art editing suite built for students. No need for external software.
*   **AI-Powered OCR**: Automatically detects scanned or handwritten documents and converts them into editable text using Tesseract.js.
*   **Professional Toolset**: Add text, shapes, signatures, highlights, and redactions.
*   **Undo/Redo System**: Full state management for a seamless editing experience.
*   **PDFGuru-Inspired UI**: A clean, premium light-themed interface for maximum productivity.

### 🏢 Multi-User Dashboards
*   **Students**: Upload files, edit in real-time, track order status, and manage payments.
*   **Print Shops**: Manage incoming queues, process orders, and update status with QR code scanning.
*   **Admin/Agents**: Oversee the entire ecosystem, manage shop approvals, and track campus-wide metrics.

### 🔐 Security & Reliability
*   **Secure Auth**: JWT-based authentication with Email OTP verification.
*   **Real-time Tracking**: Order status updates from "Pending" to "Printed" to "Collected."
*   **Optimized File Handling**: Efficient processing of large PDF documents using `pdf-lib`.

---

## 🛠️ Tech Stack

### Frontend (Website)
*   **Framework**: Next.js 15+ (App Router)
*   **Styling**: Tailwind CSS + Framer Motion (Animations)
*   **Editor Engine**: Fabric.js + PDF.js
*   **AI/OCR**: Tesseract.js
*   **State Management**: Zustand / React Hooks

### Backend (API)
*   **Runtime**: Node.js + Express
*   **Database**: MySQL (via Serv00)
*   **Auth**: JWT (JSON Web Tokens)
*   **Communication**: Nodemailer (SMTP for OTP)

---

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18+)
*   MySQL Database

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/campusprint.git
   cd campusprint
   ```

2. **Setup Backend**
   ```bash
   cd server
   npm install
   # Create a .env file based on the provided template
   npm run dev
   ```

3. **Setup Frontend**
   ```bash
   cd ../client
   npm install
   npm run dev
   ```

4. **Visit the app**
   Navigate to `http://localhost:3000`

---

## 📦 Deployment

### Frontend
Highly recommended to deploy the `client` folder to **Vercel** for optimal Next.js performance.

### Backend
Can be deployed to **Serv00** (where your database is located) or **Render**.

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

---
*Built with ❤️ for students by the CampusPrint Team.*
