const fs = require('fs');
let code = fs.readFileSync('c:/archiproj/web/components/cad/floor-plan-3d.tsx', 'utf8');

const regex = /<mesh([^>]*)>\s*<boxGeometry([^>]*)\/>\s*<primitive object=\{([^}]+)\} attach="material" \/>\s*<\/mesh>/g;

code = code.replace(regex, '<mesh$1 material={$3}>\n          <boxGeometry$2/>\n        </mesh>');

fs.writeFileSync('c:/archiproj/web/components/cad/floor-plan-3d.tsx', code);
console.log('Fixed materials');
