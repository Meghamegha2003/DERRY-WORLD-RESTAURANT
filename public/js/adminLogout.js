async function handleAdminLogout() {
    try {
        console.log('[DEBUG] Starting logout process');
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
            console.log('[DEBUG] User confirmed logout');
            
            const response = await fetch('/admin/logout', {  
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include'
            });

            console.log('[DEBUG] Logout response:', {
                status: response.status,
                statusText: response.statusText
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('[DEBUG] Logout error:', errorData);
                throw new Error(errorData.message || 'Network response was not ok');
            }

            const data = await response.json();
            console.log('[DEBUG] Logout success:', data);

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
        console.error('[DEBUG] Logout error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'An error occurred during logout'
        });
    }
}