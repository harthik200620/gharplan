const fs = require('fs');
let code = fs.readFileSync('c:/archiproj/web/components/cad/floor-plan-3d.tsx', 'utf8');

code = code.replace(/const PREMIUM_GLASS_MAT = new THREE\.MeshPhysicalMaterial\(\{[\s\S]*?\}\);/, 
`const PremiumGlassMat = () => (
  <meshPhysicalMaterial color={PREMIUM_GLASS} roughness={0.0} metalness={0.1} transmission={0.92} thickness={0.08} ior={1.5} clearcoat={1.0} clearcoatRoughness={0.02} transparent opacity={0.85} envMapIntensity={2.0} reflectivity={0.9} />
);`);

code = code.replace(/const PREMIUM_STEEL_MAT = new THREE\.MeshPhysicalMaterial\(\{[\s\S]*?\}\);/, 
`const PremiumSteelMat = () => (
  <meshPhysicalMaterial color={PREMIUM_STEEL} roughness={0.1} metalness={0.95} clearcoat={0.8} clearcoatRoughness={0.05} envMapIntensity={2.0} />
);`);

code = code.replace(/const PREMIUM_MARBLE_MAT = new THREE\.MeshPhysicalMaterial\(\{[\s\S]*?\}\);/, 
`const PremiumMarbleMat = () => (
  <meshPhysicalMaterial color={PREMIUM_MARBLE} roughness={0.05} metalness={0} clearcoat={1.0} clearcoatRoughness={0.05} envMapIntensity={1.5} />
);`);

code = code.replace(/const PREMIUM_WOOD_MAT = new THREE\.MeshPhysicalMaterial\(\{[\s\S]*?\}\);/, 
`const PremiumWoodMat = () => (
  <meshPhysicalMaterial color={PREMIUM_WOOD} roughness={0.3} metalness={0} clearcoat={0.6} clearcoatRoughness={0.2} envMapIntensity={0.8} />
);`);

code = code.replace(/const PREMIUM_CONCRETE_MAT = new THREE\.MeshPhysicalMaterial\(\{[\s\S]*?\}\);/, 
`const PremiumConcreteMat = () => (
  <meshPhysicalMaterial color={PREMIUM_CONCRETE} roughness={0.3} metalness={0.05} clearcoat={0.2} clearcoatRoughness={0.5} envMapIntensity={0.5} />
);`);

code = code.replace(/const PREMIUM_GOLD_MAT = new THREE\.MeshPhysicalMaterial\(\{[\s\S]*?\}\);/, 
`const PremiumGoldMat = () => (
  <meshPhysicalMaterial color={PREMIUM_GOLD} roughness={0.15} metalness={0.9} clearcoat={0.9} clearcoatRoughness={0.1} envMapIntensity={2.0} />
);`);

// 2. Now replace all material={PREMIUM_*_MAT} with <Premium*Mat /> as a child.
// Regex to match: <mesh([^>]*) material={PREMIUM_([A-Z]+)_MAT}([^>]*)>([\s\S]*?)<\/mesh>

let prevCode = '';
while(prevCode !== code) {
  prevCode = code;
  code = code.replace(/<mesh([^>]*) material=\{PREMIUM_([A-Z]+)_MAT\}([^>]*)>([\s\S]*?)<\/mesh>/g, (match, p1, p2, p3, p4) => {
    // p2 is GLASS, STEEL, etc.
    const matName = 'Premium' + p2.charAt(0) + p2.slice(1).toLowerCase() + 'Mat';
    return `<mesh${p1}${p3}>${p4}  <${matName} />\n        </mesh>`;
  });
}

// In case some meshes were self closing
code = code.replace(/<mesh([^>]*)\s+material=\{PREMIUM_([A-Z]+)_MAT\}([^>]*)\/>/g, (match, p1, p2, p3) => {
  const matName = 'Premium' + p2.charAt(0) + p2.slice(1).toLowerCase() + 'Mat';
  return `<mesh${p1}${p3}>\n          <${matName} />\n        </mesh>`;
});

fs.writeFileSync('c:/archiproj/web/components/cad/floor-plan-3d.tsx', code);
console.log('Converted to material components');
