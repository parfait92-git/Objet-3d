// --- INITIALISATION ---
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        camera.position.z = 10;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        const canvasContainer = $('#canvas-container');
        const mainView = $('#main-view');
        renderer.setSize(mainView.width(), mainView.height());
        canvasContainer.append(renderer.domElement);

        const pieGroup = new THREE.Group();
        scene.add(pieGroup);

        const applauseSound = new Tone.Synth().toDestination();
        
        let participants = JSON.parse(localStorage.getItem('participants')) || [];
        let usedColors = participants.map(p => p.color);
        let isSpinning = false;
        let drawCount = participants.filter(p => p.drawn).length;
        let font = null;
        let alertTimeout;
        let lastWinnerMesh = null;

        // --- GESTION DES PARTICIPANTS ---
        function addParticipant() {
            const name = $('#name-input').val().trim();
            if (name === '') return;
            if (participants.find(p => p.name.toLowerCase() === name.toLowerCase())) { showAlert("Ce nom a déjà été ajouté !"); return; }
            if (participants.length >= 10) { showAlert("Le nombre maximum de participants (10) est atteint."); return; }
            participants.push({ name: name, color: generateUniqueColor(), drawn: false, rank: null });
            $('#name-input').val('');
            updateAll();
        }
        function deleteParticipant(index) { if(isSpinning) return; participants.splice(index, 1); usedColors = participants.map(p => p.color); updateAll(); }
        function resetAll() { participants = []; usedColors = []; drawCount = 0; if (lastWinnerMesh) { lastWinnerMesh.material.color.set(0xffffff); lastWinnerMesh = null; } updateAll(); }
        function updateAll() { localStorage.setItem('participants', JSON.stringify(participants)); renderList(); renderWinnersList(); createPieChart(); updateButtonStates(); }
        
        // --- UI ---
        function renderList() {
            const list = $('#participants-list');
            list.empty();
            const notDrawn = participants.filter(p => !p.drawn);
            if(notDrawn.length === 0 && participants.length > 0) {
                 list.append('<li class="text-green-400 text-center font-semibold mt-4">Tirage terminé !</li>');
            } else if (participants.length === 0) {
                 list.append('<li class="text-gray-400 text-center italic mt-4">Ajoutez des participants.</li>');
            } else {
                 notDrawn.forEach((p) => {
                    const originalIndex = participants.indexOf(p);
                    list.append(`<li class="participant-item flex items-center justify-between bg-gray-700 p-3 rounded-lg mb-2 shadow"><div class="flex items-center min-w-0"><span class="w-4 h-4 rounded-full mr-3 flex-shrink-0" style="background-color: ${p.color};"></span><div class="truncate"><span class="participant-name" contenteditable="true" data-index="${originalIndex}">${p.name}</span></div></div><button class="delete-btn flex-shrink-0" data-index="${originalIndex}" style="pointer-events: auto;">❌</button></li>`);
                });
            }
        }
        function renderWinnersList() {
            const list = $('#winners-list');
            list.empty();
            const drawn = participants.filter(p => p.drawn).sort((a, b) => a.rank - b.rank);
            if (drawn.length === 0) {
                list.append('<li class="text-gray-400 text-center italic mt-4">En attente du tirage...</li>');
            } else {
                drawn.forEach(p => {
                    list.append(`<li class="flex items-center bg-gray-700 p-3 rounded-lg mb-2 shadow"><span class="text-lg font-bold text-yellow-400 mr-3 w-6 text-center">${p.rank}.</span><span class="w-4 h-4 rounded-full mr-3 flex-shrink-0" style="background-color: ${p.color};"></span><span>${p.name}</span></li>`);
                });
            }
        }
        function updateButtonStates() {
            const allDrawn = participants.length > 0 && participants.every(p => p.drawn);
            const maxReached = participants.length >= 10;
            $('#add-btn, #name-input').prop('disabled', maxReached);
            $('#draw-btn').prop('disabled', allDrawn || participants.filter(p=>!p.drawn).length === 0 || isSpinning);
        }
        function showAlert(message) {
            const alertBox = $('#alert-message');
            alertBox.text(message).addClass('show');
            clearTimeout(alertTimeout);
            alertTimeout = setTimeout(() => { alertBox.removeClass('show'); }, 5000);
        }

        // --- 3D & ANIMATIONS ---
        function createPieChart() {
            if (!font && participants.length > 0) return;
            while (pieGroup.children.length) { pieGroup.remove(pieGroup.children[0]); }
            const activeParticipants = participants.filter(p => !p.drawn);
            
            if (activeParticipants.length === 0) {
                 // Gérer la vue quand il n'y a plus personne à tirer
            } else {
                const sliceAngle = (2 * Math.PI) / activeParticipants.length;
                activeParticipants.forEach((p, i) => {
                    const shape = new THREE.Shape();
                    shape.moveTo(0, 0); shape.absarc(0, 0, 5, i * sliceAngle, (i + 1) * sliceAngle, false); shape.lineTo(0, 0);
                    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.1, bevelSegments: 2 });
                    const material = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.5, metalness: 0.1 });
                    const sliceMesh = new THREE.Mesh(geometry, material);
                    sliceMesh.userData = { nameRef: p.name }; // Associer la part au nom
                    pieGroup.add(sliceMesh);
                    
                    const textGeometry = new THREE.TextGeometry(p.name.length > 10 ? p.name.substring(0, 9) + '.' : p.name, { font: font, size: 0.35, height: 0.1 });
                    textGeometry.center();
                    const textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
                    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
                    textMesh.userData = { nameRef: p.name };
                    const middleAngle = i * sliceAngle + sliceAngle / 2;
                    textMesh.position.set(Math.cos(middleAngle) * 3.5, Math.sin(middleAngle) * 3.5, 1.2);
                    textMesh.rotation.z = middleAngle + (middleAngle > Math.PI / 2 && middleAngle < 3 * Math.PI / 2 ? Math.PI : 0);
                    pieGroup.add(textMesh);
                });
            }
        }
        
        function triggerConfetti() {
            const container = $('#confetti-container');
            for (let i = 0; i < 150; i++) {
                const confetti = $('<div class="confetti"></div>');
                const randomColor = `hsl(${Math.random() * 360}, 100%, 70%)`;
                confetti.css({ 'background-color': randomColor, 'left': `${Math.random() * 100}%`, 'top': `${-20 - Math.random() * 20}px` });
                container.append(confetti);
                gsap.to(confetti, { y: '110vh', x: `+=${(Math.random() - 0.5) * 400}`, rotation: `+=${(Math.random() - 0.5) * 720}`, opacity: 1, duration: 4 + Math.random() * 3, ease: "power1.out", onComplete: () => confetti.remove() });
            }
        }
        
        const light = new THREE.PointLight(0xffffff, 1, 100);
        light.position.set(0, 10, 10);
        scene.add(light);
        scene.add(new THREE.AmbientLight(0xffffff, 0.5));

        // --- TIRAGE AU SORT ---
        function startDraw() {
            if (isSpinning) return;
            const available = participants.filter(p => !p.drawn);
            if (available.length < 1) { return; }
            if (lastWinnerMesh) { lastWinnerMesh.material.color.set(0xffffff); gsap.to(lastWinnerMesh.scale, { x: 1, y: 1, z: 1, duration: 0.5 }); lastWinnerMesh = null; }

            isSpinning = true;
            updateButtonStates();
            $('#draw-btn').text('Tirage...');
            
            const winner = available[Math.floor(Math.random() * available.length)];
            const winnerIndexInActive = available.indexOf(winner);
            const sliceAngle = (2 * Math.PI) / available.length;
            const targetRotation = -((winnerIndexInActive * sliceAngle) + (sliceAngle / 2));
            
            gsap.to(pieGroup.rotation, {
                duration: 5,
                z: pieGroup.rotation.z + 10 * Math.PI + (targetRotation - (pieGroup.rotation.z % (2 * Math.PI))),
                ease: "power3.inOut",
                onComplete: () => {
                    isSpinning = false;
                    winner.drawn = true; drawCount++; winner.rank = drawCount;
                    for (let i = 0; i < 30; i++) { setTimeout(() => applauseSound.triggerAttack(), i * 30); }
                    triggerConfetti();
                    lastWinnerMesh = pieGroup.children.find(c => c.userData.nameRef === winner.name && c.type === 'Mesh' && c.geometry.type === 'TextGeometry');
                    if (lastWinnerMesh) {
                        gsap.to(lastWinnerMesh.scale, { x: 1.5, y: 1.5, z: 1.5, duration: 0.5, ease: "power2.out" });
                        lastWinnerMesh.material.color.set(0xffff00);
                    }
                    updateAll();
                }
            });
        }
        
        // --- BOUCLE PRINCIPALE ET ÉVÉNEMENTS ---
        function animate() { requestAnimationFrame(animate); if (!isSpinning) { pieGroup.rotation.z += 0.002; } renderer.render(scene, camera); }
        function onWindowResize() { const newWidth = mainView.width(); const newHeight = mainView.height(); camera.aspect = newWidth / newHeight; camera.updateProjectionMatrix(); renderer.setSize(newWidth, newHeight); }
        function generateUniqueColor() { let color; do { color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'); } while (usedColors.includes(color)); usedColors.push(color); return color; }

        $('#add-btn').on('click', addParticipant);
        $('#reset-btn').on('click', resetAll);
        $('#participants-list').on('click', '.delete-btn', function() { deleteParticipant($(this).data('index')); });
        $('#draw-btn').on('click', startDraw);
        $(window).on('resize', onWindowResize);
        
        $('#participants-list').on('blur', '.participant-name', function() {
            const index = $(this).data('index'); const newName = $(this).text().trim(); if(!participants[index]) return; const oldName = participants[index].name;
            if (newName && oldName !== newName) {
                if (!participants.some((p, i) => i !== index && p.name.toLowerCase() === newName.toLowerCase())) {
                    participants[index].name = newName; updateAll();
                } else { $(this).text(oldName); }
            } else if (!newName) { $(this).text(oldName); }
        });

        const fontLoader = new THREE.FontLoader();
        fontLoader.load('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/fonts/helvetiker_regular.typeface.json', (loadedFont) => {
            font = loadedFont;
            onWindowResize();
            updateAll();
            animate();
        });