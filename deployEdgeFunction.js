// Deploy updated Salesforce OAuth callback Edge Function
const { exec } = require('child_process');
const path = require('path');

console.log('Deploying updated Salesforce OAuth callback Edge Function...');

const functionPath = path.join(__dirname, 'supabase', 'functions', 'salesforce-oauth-callback');
const deployCommand = `supabase functions deploy salesforce-oauth-callback --project-ref luwlvmcixwdtuaffamgk`;

exec(deployCommand, { cwd: __dirname }, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Deployment failed:', error);
    return;
  }
  
  if (stderr) {
    console.error('⚠️  Deployment warnings:', stderr);
  }
  
  console.log('✅ Deployment output:', stdout);
  console.log('\n🎉 Edge Function deployed successfully!');
  console.log('URL: https://luwlvmcixwdtuaffamgk.supabase.co/functions/v1/salesforce-oauth-callback');
});
