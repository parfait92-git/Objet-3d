// --- Configuration de la scène ---
const canvas = document.getElementById('main-canvas');
const scene = new THREE.Scene(); // la librairie three.js aide à facilement faire la 3D sur le web

// --- Initialisation de la Caméra ---
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

// --- Rendu ---
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// --- On construit l'objet 3D ---
const geometry = new THREE.TorusKnotGeometry(1.5, 0.4, 128, 20); // Augmentation de la définition
const material = new THREE.MeshNormalMaterial({ wireframe: true });
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// --- Gère la Lumières ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const pointLight = new THREE.PointLight(0xffffff, 0.7);
pointLight.position.set(5, 5, 5);
scene.add(pointLight);

// --- Variables pour les interactions (survol de la souris et defilement de la page) ---
let scrollY = 0;
const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let isZoomed = false;
const targetScale = new THREE.Vector3(1, 1, 1);
const zoomedScale = new THREE.Vector3(1.4, 1.4, 1.4);
const normalScale = new THREE.Vector3(1, 1, 1);

// --- GESTIONNAIRES D'ÉVÉNEMENTS ---

/**
 * Met à jour la rotation cible en fonction du défilement.
 */
function handleScroll(event) {
    scrollY += event.deltaY * 0.002;
}
window.addEventListener('wheel', handleScroll);

/**
 * Met à jour les coordonnées de la souris (normalisées de -1 à +1).
 */
function handleMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}
// appelle handleMouseMove lorsqu'on deplace la souris
window.addEventListener('mousemove', handleMouseMove);

/**
 * Gère le clic pour zoomer/dézoomer. le paramettre event ici prendre 
 */
function handleMouseClick(event) {
    // Met à jour la position du raycaster avec la caméra et la souris click un attraibut js
    raycaster.setFromCamera(mouse, camera);

    // Calcule les objets qui intersectent le rayon
    const intersects = raycaster.intersectObjects([mesh]);

    if (intersects.length > 0) {
        // Si l'objet est cliqué, on inverse l'état de zoom
        isZoomed = !isZoomed;
        if (isZoomed) {
            targetScale.copy(zoomedScale);
        } else {
            targetScale.copy(normalScale);
        }
    }
}
// --- À l'action de click on execute notre fonction handleMouseClick
window.addEventListener('click', handleMouseClick);

// --- BOUCLE D'ANIMATION ---
const clock = new THREE.Clock();

const animate = () => {
    requestAnimationFrame(animate);

    const elapsedTime = clock.getElapsedTime();

    // --- Calcul de la rotation ---
    // La rotation est influencée par le défilement (scrollY) ET la position de la souris.
    const targetRotationY = scrollY + mouse.x * 0.5;
    const targetRotationX = scrollY * 0.5 + mouse.y * 0.5;

    // Interpolation douce (lerp) pour un mouvement fluide vers la cible de rotation
    mesh.rotation.y += (targetRotationY - mesh.rotation.y) * 0.05;
    mesh.rotation.x += (targetRotationX - mesh.rotation.x) * 0.05;

    // --- Animation de l'échelle (zoom) ---
    // Interpolation douce de l'échelle actuelle vers l'échelle cible
    mesh.scale.lerp(targetScale, 0.1);

    // Une petite rotation constante pour garder la scène vivante
    mesh.rotation.z = elapsedTime * 0.1;

    renderer.render(scene, camera);
};

// --- Gestion du redimensionnement de la fenêtre ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// --- On execute la fonction d'animation sinon ca ne va pas fonctionner
animate();