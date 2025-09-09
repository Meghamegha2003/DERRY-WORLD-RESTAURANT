function handleUserLogout() {
  Swal.fire({
    title: 'Logout?',
    text: "Are you sure you want to log out?",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Yes, logout'
  }).then((result) => {
    if (result.isConfirmed) {
      // User logout uses GET method and redirects directly
      window.location.href = '/logout';
    }
  });
}
