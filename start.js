const { spawn } = require('child_process');

function runScript(scriptPath, args = []) {
    return spawn('node', [scriptPath, ...args], { stdio: 'inherit' });
}
const broker = runScript('./broker.js');
const miniApi = runScript('./mini_api.js');

broker.on('close', (code) => {
    console.log(`broker.js terminó con código ${code}`);
});

miniApi.on('close', (code) => {
    console.log(`mini_api.js terminó con código ${code}`);
});
