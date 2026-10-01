<h1 align="center">🍽️ Derry World ✨</h1>

<h3 align="center">
  <i>A complete single-restaurant food delivery web application</i>
</h3>

<p align="center">

  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" />

  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" />

  <img src="https://img.shields.io/badge/Bootstrap-7952B3?style=for-the-badge&logo=bootstrap&logoColor=white" />

  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" />

  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" />

  <img src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white" />

  <img src="https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white" />

  <img src="https://img.shields.io/badge/Razorpay-3395FF?style=for-the-badge&logo=razorpay&logoColor=white" />

</p>

<p align="center">
  <b>🌐 <a href="https://derry-world-restaurant.onrender.com/">Live Demo</a></b>
</p>

<p align="center">
  Created by <b>Megha Gopalakrishnan</b>
</p>

---

## 📌 Overview

<b>Derry World</b> is a full-stack single-restaurant food delivery web application built using Node.js, Express.js, MongoDB, EJS, JavaScript, and Bootstrap.

The application provides a complete online food ordering experience where users can browse the restaurant menu, search and filter food items, view food details, manage their cart and wishlist, manage delivery addresses, and manage their digital wallet.

The application also supports secure authentication with OTP verification and Google OAuth.

A dedicated <b>Admin Dashboard</b> allows administrators to manage customers, monitor dashboard data, and generate sales reports in PDF and Excel formats.

The project follows the <b>MVC architecture</b> and uses RESTful APIs for backend operations.

---

## ✨ Features

### 👤 User Features

* 🏠 Responsive home page
* 🍽️ Restaurant menu
* 🔎 Search food items
* 🏷️ Category-based filtering
* 📋 Food details page
* 🛒 Shopping cart
* ❤️ Wishlist
* 📍 Address management
* 👤 User profile
* 🔐 User authentication
* 🔑 Login & registration
* 📧 OTP verification
* 🔄 Resend OTP
* 🔒 Forgot password
* 🔑 Reset password
* 🌐 Google OAuth authentication
* 🚪 Secure logout

### 🛒 Cart & Wishlist

* Add food items to cart
* Update food quantity
* Remove food from cart
* View cart
* Add/remove wishlist items
* Wishlist management
* Check food availability

### 💰 Wallet & Payment

* Digital wallet
* View wallet balance
* Add money to wallet
* Razorpay payment integration
* Razorpay payment verification
* Wallet transaction handling
* Secure payment confirmation

### 📍 Address Management

Users can:

* Add delivery addresses
* Edit delivery addresses
* Delete addresses
* Manage multiple delivery addresses

### 🛠️ Admin Dashboard

* 📊 Admin dashboard
* 👥 Customer management
* 🔄 Activate/deactivate customers
* 📈 Sales dashboard
* 📋 Sales reports
* 📄 Export sales reports as PDF
* 📊 Export sales reports as Excel
* 🔐 Protected admin authentication
* 🚪 Admin logout

---

## 🧑‍💻 Tech Stack

### Frontend

* HTML5
* CSS3
* JavaScript
* Bootstrap
* EJS

### Backend

* Node.js
* Express.js
* REST APIs
* MVC Architecture
* Passport.js

### Database

* MongoDB
* Mongoose

### Authentication

* Session-based authentication
* OTP verification
* Google OAuth
* Passport.js

### Payment

* Razorpay

### Tools

* Git
* GitHub
* VS Code
* Postman

---

## 🔌 REST APIs

The application uses RESTful APIs for communication between the frontend and backend.

### Main API Modules

* 👤 User & Authentication APIs
* 🍔 Food & Menu APIs
* 🛒 Cart APIs
* ❤️ Wishlist APIs
* 📍 Address APIs
* 💰 Wallet & Payment APIs
* 📊 Admin APIs
* 📈 Sales Report APIs

### Basic API Operations

```text
GET       Fetch data
POST      Create data
PUT       Update data
PATCH     Partially update data
DELETE    Remove data
```

These APIs handle user authentication, food browsing, cart management, wishlist, addresses, wallet payments, and admin operations.

---

## 🔐 Authentication

Derry World provides multiple authentication features:

* User registration
* User login
* OTP verification
* OTP resend
* Forgot password
* Reset password
* Google OAuth login
* Session authentication
* Protected user routes
* Protected admin routes
* Logout functionality

### Google Authentication Flow

```text
User
  ↓
Google Login
  ↓
Google OAuth
  ↓
Authentication
  ↓
User Verification
  ↓
Home Page
```

---

## 💳 Razorpay Integration

Razorpay is integrated into the application for secure online wallet payments.

### Payment Flow

```text
User
  ↓
Wallet
  ↓
Add Money
  ↓
Create Payment
  ↓
Razorpay
  ↓
Payment Completed
  ↓
Payment Verification
  ↓
Wallet Balance Updated
```

Users can add money to their wallet through Razorpay and manage their wallet balance.

---

## 🍔 Food Browsing Flow

```text
Home
  ↓
Menu
  ↓
Search / Filter
  ↓
Food Details
  ↓
Add to Cart
  ↓
Cart
```

Users can browse food items, search for specific dishes, filter by category, view detailed food information, and add items to their cart.

---

## ❤️ Wishlist Flow

```text
Menu
  ↓
Select Food
  ↓
Add to Wishlist
  ↓
Wishlist
  ↓
Remove / Manage Wishlist
```

Users can save their favorite food items and manage them through the wishlist.

---

## 📍 Address Management

The application provides complete delivery address management.

Users can:

* Add a new address
* Update an existing address
* Delete an address
* Manage multiple addresses

---

## 🔎 Search & Filtering

The menu provides search and filtering functionality.

### Available Features

* Search food by name
* Filter food by category
* Browse category-specific food
* Filter menu items
* Check food availability

---

## 📊 Admin Dashboard

The admin dashboard provides an overview of the restaurant application.

### Admin Features

* Dashboard
* Customer management
* Customer status management
* Sales data
* Sales reports
* PDF export
* Excel export

### Customer Management

Administrators can:

* View customers
* Manage customer status
* Activate customers
* Deactivate customers

---

## 📈 Sales Reports

The admin can generate sales reports and export them into different formats.

### Supported Formats

* 📄 PDF
* 📊 Excel

This makes it easier to analyze and maintain restaurant sales information.

---

## 🛡️ Security

The application includes:

* Authentication middleware
* Admin authentication middleware
* Protected user routes
* Protected admin routes
* Session management
* OTP verification
* Google OAuth
* Password management
* Razorpay payment verification
* Authentication page protection
* Cache-control handling

---

## 📱 Responsive Design

Derry World is designed to provide a responsive experience across:

* 💻 Desktop
* 💻 Laptop
* 📱 Mobile
* 📱 Tablet

Bootstrap is used to create responsive layouts and reusable UI components.

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/Meghamegha2003/DERRY-WORLD-RESTAURANT
```

### 2. Navigate to the Project

```bash
cd DERRY-WORLD-RESTAURANT
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment Variables

Create a `.env` file:

```env

PORT=5000

CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name

EMAIL_PASS=your_email_password
EMAIL_USER=your_email_user
BREVO_FROM_EMAIL=your_sender_email

GOOGLE_CALLBACK_URL=https://your-domain.com/auth/google/callback
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

JWT_SECRET=your_jwt_secret

MONGODB_URI=your_mongodb_connection_string

RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

```

### 5. Start the Application

```bash
npm start
```


For development:

```bash
npm run dev
```

---

## 🎯 Project Highlights

* 🍽️ Single-restaurant food delivery platform
* 🛒 Complete cart management
* ❤️ Wishlist functionality
* 📍 Address management
* 💰 Digital wallet
* 💳 Razorpay integration
* 🔐 OTP authentication
* 🌐 Google OAuth
* 🔎 Search and filtering
* 📊 Admin dashboard
* 👥 Customer management
* 📈 Sales reports
* 📄 PDF report export
* 📊 Excel report export
* 🏗️ MVC architecture
* 🔌 RESTful APIs
* 🍃 MongoDB database
* 📱 Responsive UI

---

## 👨‍💻 Author

<p align="center">
  <b>Megha Gopalakrishnan</b><br>
  Full Stack Developer
</p>

<p align="center">
  <a href="https://www.linkedin.com/in/megha-gopalakrishnan">
    LinkedIn
  </a>
  •
  <a href="https://github.com/Meghamegha2003">
    GitHub
  </a>
</p>

<p align="center">
  <i>Built with ❤️ by Megha Gopalakrishnan</i>
</p>

