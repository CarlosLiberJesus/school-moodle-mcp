import { MoodleMCP } from '../src/mcp_server.js';

async function testActivityFetch() {
  try {
    console.log('Starting activity fetch test...');
    const mcpServer = new MoodleMCP();
    
    // Test 1: Get activity details by ID
    console.log('\nTest 1: Getting activity details by ID 150...');
    const activityDetails = await mcpServer.callToolForTests('get_activity_details', { activity_id: 150 });
    console.log('Activity Details:', JSON.stringify(activityDetails, null, 2));
    
    // Test 2: Fetch activity content
    console.log('\nTest 2: Fetching activity content...');
    const content = await mcpServer.callToolForTests('fetch_activity_content', { activity_id: 150 });
    console.log('Activity Content:', content);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testActivityFetch();
