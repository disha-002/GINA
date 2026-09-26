/**
 * Convert error codes and messages to user-friendly messages
 */

export function toFriendlyErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // File validation errors
    if (message.includes('file') && message.includes('type')) {
      return 'That file format isn\'t supported. Please use CSV, XLSX, or XLS files.';
    }
    if (message.includes('size') || message.includes('too large')) {
      return 'Your file is too large. Please upload a file under 50MB.';
    }

    // Network/API errors
    if (message.includes('network') || message.includes('fetch')) {
      return 'Connection issue. Please check your internet and try again.';
    }
    if (message.includes('timeout')) {
      return 'Request took too long. Please try again.';
    }

    // Server errors
    if (message.includes('500') || message.includes('server')) {
      return 'Our server encountered an issue. Please try again in a moment.';
    }
    if (message.includes('401') || message.includes('unauthorized')) {
      return 'Your session expired. Please log in again.';
    }
    if (message.includes('403') || message.includes('forbidden')) {
      return 'You don\'t have permission to perform this action.';
    }
    if (message.includes('404') || message.includes('not found')) {
      return 'That resource wasn\'t found. Please try again.';
    }

    // Fallback to original if it seems user-friendly
    if (message.length < 80 && !message.includes('error') && !message.includes('failed')) {
      return error.message;
    }
  }

  // Generic fallback
  return 'Something went wrong. Please try again.';
}
