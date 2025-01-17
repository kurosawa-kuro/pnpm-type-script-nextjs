'use server'

export async function logBasicAction(prevState: any, formData: FormData) {
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
    return { message: 'Success' };
  } catch (error) {
    console.error('Logging error:', error);
    return { message: 'Error' };
  }
} 