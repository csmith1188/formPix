/**
 * Test script for Winston logger
 */

const logger = require('./utils/logger');

console.log('\n=== Testing Winston Logger ===\n');

// Test different log levels
logger.info('Testing INFO level - Server startup simulation', { port: 3000, status: 'running' });

logger.warn('Testing WARN level - Missing optional parameter', { param: 'backgroundColor', default: '#000000' });

logger.debug('Testing DEBUG level - Detailed operation info', {
    operation: 'pixelUpdate',
    pixelCount: 256,
    color: 'FF0000'
});

// Test successful operation logging
logger.info('Testing successful operation', {
    endpoint: '/api/fill',
    color: 'FFFFFF',
    duration: '15ms'
});

// Test error with actual Error object
try {
    throw new Error('Test error with stack trace');
} catch (err) {
    logger.error('Caught exception test', { error: err.message, stack: err.stack });
}

console.log('\n=== Logger Test Complete ===');
console.log('Check the following files:');
console.log('  - logs/app-' + new Date().toISOString().split('T')[0] + '.log');
console.log('  - logs/error-' + new Date().toISOString().split('T')[0] + '.log');
console.log('\nAll test messages should appear in console (colored) and in log files.');
