async function handleAdminLogout() {
    try {
        const result = await Swal.fire({
            title: 'Are you sure?',
            text: "You will be logged out",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#8B4513',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, logout',
            cancelButtonText: 'Cancel'
        });

        if (result.isConfirmed) {
            
            const response = await fetch('/admin/logout', {  
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include'
            });


            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Network response was not ok');
            }

            const data = await response.json();

            // Show success message and redirect
            await Swal.fire({
                icon: 'success',
                title: 'Success',
                text: 'Logged out successfully',
                showConfirmButton: false,
                timer: 1500,
                timerProgressBar: true
            });
            
            // Redirect to login page
            window.location.href = '/admin/login';
        }
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'An error occurred during logout'
        });
    }
}