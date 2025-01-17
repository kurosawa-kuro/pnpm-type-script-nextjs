'use server'

type LogResult = {
  message: string;
  requestId: string;
  timestamp: string;
  duration: string;
};

export async function logBasicAction(): Promise<LogResult> {
  try {
    const startTime = performance.now();
    const requestId = Math.random().toString(36).substring(7);
    const timestamp = new Date().toISOString();
    const duration = `${(performance.now() - startTime).toFixed(2)}ms`;

    const logEntry = {
      status: 'success',
      requestId,
      message: 'Basic log action called',
      timestamp,
      duration
    };

    console.log('Log Entry:', logEntry);
    
    return {
      message: 'Success',
      requestId,
      timestamp,
      duration
    };
  } catch (error) {
    console.error('Logging error:', error);
    return { 
      message: 'Error',
      requestId: '',
      timestamp: '',
      duration: ''
    };
  }
} 