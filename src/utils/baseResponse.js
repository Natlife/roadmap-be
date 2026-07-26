function successResponse(data, message = 'Success', code = 1000) {
  return {
    code,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}

function errorResponse(message = 'An error occurred', code = 400) {
  return {
    code,
    message,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  successResponse,
  errorResponse,
};
