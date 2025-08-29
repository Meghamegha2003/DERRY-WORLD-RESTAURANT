function handleAdminLogout() {
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
      fetch('/admin/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          window.location.href = '/admin/login';
        } else {
          Swal.fire('Error', data.message || 'Logout failed', 'error');
        }
      })
      .catch(error => {
        Swal.fire('Error', 'Something went wrong. Please try again.', 'error');
      });
    }
  });
}
