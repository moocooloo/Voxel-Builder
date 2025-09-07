import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Global State ---
let currentMode = 'build'; // Can be 'build', 'erase', 'hand', 'scale', 'undo', or 'view_actual'
let currentColor = 0x00ffff; // Default color: cyan
let isBuilding = false;
let isPixelView = false;

// --- DOM Elements ---
const voxelButton = document.getElementById('voxel-button');
const eraserButton = document.getElementById('eraser-button');
const handButton = document.getElementById('hand-button');
const scaleButton = document.getElementById('scale-button');
const undoButton = document.getElementById('undo-button');
const viewActualButton = document.getElementById('view-actual-button');
const saveButton = document.getElementById('save-button');
const loadButton = document.getElementById('load-button');
const colorPicker = document.getElementById('color-picker');
const saveMessageBox = document.getElementById('save-message-box');
const saveCodeElement = document.getElementById('save-code');
const closeSaveButton = document.getElementById('close-save-button');
const loadMessageBox = document.getElementById('load-message-box');
const loadCodeInput = document.getElementById('load-code-input');
const loadCodeButton = document.getElementById('load-code-button');
const closeLoadButton = document.getElementById('close-load-button');
const scaleMessageBox = document.getElementById('scale-message-box');
const scaleXInput = document.getElementById('scaleX');
const scaleYInput = document.getElementById('scaleY');
const scaleZInput = document.getElementById('scaleZ');
const scaleZCheckbox = document.getElementById('scaleZCheckbox');
const applyScaleButton = document.getElementById('applyScaleButton');
const closeScaleButton = document.getElementById('closeScaleButton');

// --- Basic Three.js Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.001, 10000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- Camera Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;

// Set initial camera position and make it look at the origin (0,0,0)
camera.position.set(20, 20, 50);
camera.lookAt(0, 0, 0);

// --- Voxel and Data Logic ---
const voxelSize = 10;
const voxelMap = new Map();
const voxelGeometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);

// NEW: Undo History and State Management
const history = [];
let historyIndex = -1;

function saveState() {
    const state = [];
    voxelMap.forEach((data, key) => {
        const { x, y, z } = data.mesh.position;
        const { x: scaleX, y: scaleY, z: scaleZ } = data.mesh.scale;
        const color = data.mesh.material.color.getHex();
        state.push({ x, y, z, color, scaleX, scaleY, scaleZ });
    });
    // Truncate history if a new action is performed after an undo
    if (historyIndex < history.length - 1) {
        history.splice(historyIndex + 1);
    }
    history.push(state);
    historyIndex = history.length - 1;
}

function restoreState(state) {
    clearScene();
    if (state && state.length > 0) {
        state.forEach(data => {
            createVoxel(data.x, data.y, data.z, data.color, data.scaleX, data.scaleY, data.scaleZ);
        });
    } else {
        // If restoring to an empty state, place a single voxel
        createVoxel(0, 0, 0, currentColor);
    }
}

// Function to create and add a new voxel
function createVoxel(x, y, z, color, scaleX = 1, scaleY = 1, scaleZ = 1) {
    const material = new THREE.MeshLambertMaterial({ color: color });
    const voxel = new THREE.Mesh(voxelGeometry, material);
    voxel.position.set(x, y, z);
    voxel.scale.set(scaleX, scaleY, scaleZ);
    // NEW: Store original position and scale for 'View Actually' button
    voxel.userData.originalPosition = new THREE.Vector3(x, y, z);
    voxel.userData.currentScale = new THREE.Vector3(scaleX, scaleY, scaleZ);
    scene.add(voxel);
    const key = `${x},${y},${z}`;
    voxelMap.set(key, { color: color, mesh: voxel });
}

// Function to remove a voxel
function removeVoxel(x, y, z) {
    const key = `${x},${y},${z}`;
    if (voxelMap.has(key)) {
        const voxelData = voxelMap.get(key);
        scene.remove(voxelData.mesh);
        voxelData.mesh.geometry.dispose();
        voxelData.mesh.material.dispose();
        voxelMap.delete(key);
    }
}

// Function to remove all voxels from the scene
function clearScene() {
    voxelMap.forEach(voxelData => {
        scene.remove(voxelData.mesh);
        voxelData.mesh.geometry.dispose();
        voxelData.mesh.material.dispose();
    });
    voxelMap.clear();
}

// Function to generate the save code string
function generateSaveCode() {
    let codeString = '';
    voxelMap.forEach((data, key) => {
        const { x, y, z } = data.mesh.position;
        const { x: scaleX, y: scaleY, z: scaleZ } = data.mesh.scale;
        const color = data.mesh.material.color.getHexString();
        codeString += `(${x})(${y})(${z})(#${color})(${scaleX})(${scaleY})(${scaleZ})`;
    });
    return codeString;
}

// Function to load the model from a save code string
function loadFromCode(code) {
    if (isBuilding) return; 

    const voxelPattern = /\((.+?)\)\((.+?)\)\((.+?)\)\((#[\da-fA-F]{6})\)\((.+?)\)\((.+?)\)\((.+?)\)/g;
    let matches = [];
    let match;

    while ((match = voxelPattern.exec(code)) !== null) {
        matches.push(match);
    }

    if (matches.length === 0) {
        console.error("Invalid or empty save code provided.");
        return;
    }
    
    isBuilding = true;
    clearScene();
    historyIndex = -1; // Clear history before new load
    let i = 0;
    
    function buildNextVoxel() {
        if (i < matches.length) {
            const match = matches[i];
            const x = parseFloat(match[1]);
            const y = parseFloat(match[2]);
            const z = parseFloat(match[3]);
            const color = new THREE.Color(match[4]).getHex();
            const scaleX = parseFloat(match[5]);
            const scaleY = parseFloat(match[6]);
            const scaleZ = parseFloat(match[7]);
            
            createVoxel(x, y, z, color, scaleX, scaleY, scaleZ);
            i++;
            setTimeout(buildNextVoxel, 5); // Faster build for loading
        } else {
            isBuilding = false;
            saveState(); // Save the loaded state
        }
    }

    buildNextVoxel();
}

// NEW: Scaling Functionality creates new voxels
function scaleModel() {
    const scaleX = parseInt(scaleXInput.value);
    const scaleY = parseInt(scaleYInput.value);
    const scaleZ = parseInt(scaleZInput.value);
    const scaleYValue = scaleZCheckbox.checked;

    const hasValidScaleX = !isNaN(scaleX) && scaleX > 0;
    const hasValidScaleY = !isNaN(scaleY) && scaleY > 0;
    const hasValidScaleZ = !isNaN(scaleZ) && scaleZ > 0;
    
    // Copy the current state before clearing the scene
    const originalVoxels = Array.from(voxelMap.values()).map(data => ({
        position: data.mesh.position.clone(),
        color: data.mesh.material.color.getHex()
    }));
    
    clearScene();

    originalVoxels.forEach(originalVoxel => {
        const { x, y, z } = originalVoxel.position;
        const color = originalVoxel.color;

        // Create new voxels to "fill in" the scaled area
        for (let i = 0; i < scaleX; i++) {
            const newX = x + i * voxelSize;
            for (let j = 0; j < (scaleYValue ? scaleY : 1); j++) {
                const newY = y + j * voxelSize;
                for (let k = 0; k < scaleZ; k++) {
                    const newZ = z + k * voxelSize;
                    createVoxel(newX, newY, newZ, color);
                }
            }
        }
    });

    scaleMessageBox.style.display = 'none';
    saveState(); // Save the new, scaled state
}

// Toggle "pixel-perfect" view
function togglePixelView() {
    isPixelView = !isPixelView;

    voxelMap.forEach(data => {
        const mesh = data.mesh;
        if (isPixelView) {
            // Store current position before going to pixel view
            mesh.userData.currentPosition = mesh.position.clone();
            // Store current scale before going to pixel view
            mesh.userData.currentScale = mesh.scale.clone();
            
            // Set scale to pixel size
            mesh.scale.set(0.1, 0.1, 0.1);
            // Set position back to original grid to keep them together
            mesh.position.copy(mesh.userData.originalPosition);
        } else {
            // Restore the scale and position from before pixel view was toggled
            mesh.scale.copy(mesh.userData.currentScale);
            mesh.position.copy(mesh.userData.currentPosition);
        }
    });
}

// Undo function
function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        restoreState(history[historyIndex]);
    } else {
        // Optional: show a message if there is no more history
        console.log("No more undo history.");
    }
}

// --- Event Listeners for UI ---
const toolButtons = [voxelButton, eraserButton, handButton, scaleButton, saveButton, loadButton, undoButton, viewActualButton];

function setActiveButton(activeButton) {
    toolButtons.forEach(button => button.classList.remove('active-mode'));
    if (activeButton) {
        activeButton.classList.add('active-mode');
    }
}

voxelButton.addEventListener('click', () => {
    currentMode = 'build';
    controls.enabled = false;
    setActiveButton(voxelButton);
});

eraserButton.addEventListener('click', () => {
    currentMode = 'erase';
    controls.enabled = false;
    setActiveButton(eraserButton);
});

handButton.addEventListener('click', () => {
    currentMode = 'hand';
    controls.enabled = true;
    setActiveButton(handButton);
});

scaleButton.addEventListener('click', () => {
    currentMode = 'scale';
    controls.enabled = false;
    setActiveButton(scaleButton);
    scaleMessageBox.style.display = 'block';
});

undoButton.addEventListener('click', undo);

viewActualButton.addEventListener('click', togglePixelView);

applyScaleButton.addEventListener('click', scaleModel);

closeScaleButton.addEventListener('click', () => {
    scaleMessageBox.style.display = 'none';
});

saveButton.addEventListener('click', () => {
    const code = generateSaveCode();
    saveCodeElement.textContent = code;
    saveMessageBox.style.display = 'block';
});

closeSaveButton.addEventListener('click', () => {
    saveMessageBox.style.display = 'none';
});

loadButton.addEventListener('click', () => {
    currentMode = 'load';
    controls.enabled = false;
    setActiveButton(loadButton);
    loadMessageBox.style.display = 'block';
});

loadCodeButton.addEventListener('click', () => {
    const code = loadCodeInput.value;
    loadFromCode(code);
    loadMessageBox.style.display = 'none';
});

closeLoadButton.addEventListener('click', () => {
    loadMessageBox.style.display = 'none';
});

colorPicker.addEventListener('input', (event) => {
    currentColor = new THREE.Color(event.target.value).getHex();
});

// --- Mouse Interaction ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('mousedown', (event) => {
    if (currentMode === 'hand' || currentMode === 'load' || currentMode === 'scale' || isBuilding) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children);

    if (intersects.length > 0) {
        const clickedObject = intersects[0].object;

        if (currentMode === 'erase') {
            removeVoxel(clickedObject.position.x, clickedObject.position.y, clickedObject.position.z);
            saveState(); // Save state after removing
        } else if (currentMode === 'build') {
            const face = intersects[0].face;
            const normal = face.normal;
            
            const newX = clickedObject.position.x + normal.x * voxelSize;
            const newY = clickedObject.position.y + normal.y * voxelSize;
            const newZ = clickedObject.position.z + normal.z * voxelSize;

            const key = `${newX},${newY},${newZ}`;
            if (!voxelMap.has(key)) {
                createVoxel(newX, newY, newZ, currentColor);
                saveState(); // Save state after creating
            }
        }
    }
});

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(1, 1, 1);
scene.add(directionalLight);

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

// --- Initial Scene Setup ---
// Place the first voxel at the center (0, 0, 0)
createVoxel(0, 0, 0, currentColor);
saveState(); // Save the initial state

// --- Handle window resize ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});