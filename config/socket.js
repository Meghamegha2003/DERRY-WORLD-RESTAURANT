const socketIO = require('socket.io');

let io;

module.exports = {
    init: (server) => {
        io = socketIO(server);
        
        io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);
            
            socket.on('authenticate', (userId) => {
                socket.join(`user:${userId}`);
                console.log(`User ${userId} authenticated on socket ${socket.id}`);
            });
            
            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
            });
        });
        
        return io;
    },
    
    getIO: () => {
        if (!io) {
            throw new Error('Socket.io not initialized');
        }
        return io;
    }
};