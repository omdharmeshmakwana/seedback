function errorHandler(err, req, res, next) {
  console.error("Error:", err.message);
  console.error(err.stack);

  // Axios errors from Seedance API
  if (err.response) {
    console.error("Seedance API Error Response Data:", JSON.stringify(err.response.data, null, 2));
    return res.status(err.response.status || 502).json({
      error: "External API error",
      message: err.response.data?.error || err.message,
      details: err.response.data,
    });
  }

  // Timeout errors
  if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
    return res.status(504).json({
      error: "Request timeout",
      message: "The request timed out. Please try again.",
    });
  }

  // Prisma errors
  if (err.code?.startsWith("P")) {
    return res.status(400).json({
      error: "Database error",
      message: err.message,
    });
  }

  // Validation errors
  if (err.status === 400) {
    return res.status(400).json({
      error: "Validation error",
      message: err.message,
    });
  }

  // Default
  res.status(err.status || 500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : "Something went wrong",
  });
}

module.exports = errorHandler;
