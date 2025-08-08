// Error handler utility
const errorHandler = {
  // Common error response format
  sendError: (res, statusCode = 500, message = 'An error occurred', error = null) => {
    const response = {
      success: false,
      message
    };

    // Only include error details in development
    if (process.env.NODE_ENV === 'development' && error) {
      response.error = error.message || error;
      response.stack = error.stack;
    }

    return res.status(statusCode).json(response);
  },

  // Common success response format
  sendSuccess: (res, data = {}, message = 'Success', statusCode = 200) => {
    return res.status(statusCode).json({
      success: true,
      message,
      data
    });
  },

  // Common error types
  errorTypes: {
    NOT_FOUND: 'Not Found',
    UNAUTHORIZED: 'Unauthorized',
    FORBIDDEN: 'Forbidden',
    BAD_REQUEST: 'Bad Request',
    VALIDATION_ERROR: 'Validation Error',
    INTERNAL_SERVER_ERROR: 'Internal Server Error'
  }
};

module.exports = errorHandler;
