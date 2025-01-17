'use server'

export async function logBasicAction(): Promise<void> {
  try {
    const startTime = performance.now();
    const requestId = Math.random().toString(36).substring(7);
    const timestamp = new Date().toISOString();

    const logEntry = {
      status: 'success',
      requestId,
      message: 'Basic log action called',
      timestamp,
      duration: `${(performance.now() - startTime).toFixed(2)}ms`
    };

    console.log('Log Entry:', logEntry);
  } catch (error) {
    console.error('Logging error:', error);
  }
} 