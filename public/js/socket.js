// Only initialize socket for user pages
if (!window.location.pathname.startsWith('/admin')) {
    // Initialize Socket.io connection
    const socket = io();

    // Get user ID from meta tag
    const userIdMeta = document.querySelector('meta[name="user-id"]');
    if (userIdMeta) {
        const userId = userIdMeta.getAttribute('content');
        
        // Authenticate socket connection with user ID
        socket.emit('authenticate', userId);
        
        // Listen for block events
        socket.on('user:blocked', (data) => {
            // Show alert to user
            alert(data.message);
            
            // Clear user token
            document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            
            // Redirect to login page
            window.location.href = '/login?error=Your+account+has+been+blocked';
        });
    }
}
