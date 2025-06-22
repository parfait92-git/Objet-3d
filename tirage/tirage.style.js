        // --- INITIALISATION ---
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        camera.position.z = 10;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        const canvasContainer = $('#canvas-container');
        const mainView = $(canvasContainer).parent();
        renderer.setSize(mainView.width(), mainView.height());
        canvasContainer.append(renderer.domElement);

        const pieGroup = new THREE.Group();
        scene.add(pieGroup);

        const synth = new Tone.Synth().toDestination();
        let participants = JSON.parse(localStorage.getItem('participants')) || [];
        let usedColors = participants.map(p => p.color);
        let isSpinning = false;
        let drawCount = participants.filter(p => p.drawn).length;
        let font = null;

        // --- GESTION DES PARTICIPANTS ---
        function addParticipant() {
            const name = $('#name-input').val().trim();
            if (name === '' || participants.find(p => p.name.toLowerCase() === name.toLowerCase())) {
                $('#name-input').val('');
                return;
            }
            participants.push({ name: name, color: generateUniqueColor(), drawn: false, rank: null });
            $('#name-input').val('');
            updateAll();
        }

        function deleteParticipant(index) {
            if(isSpinning) return;
            participants.splice(index, 1);
            usedColors = participants.map(p => p.color);
            updateAll();
        }

        function updateAll() {
            localStorage.setItem('participants', JSON.stringify(participants));
            renderList();
            createPieChart();
        }
        
        // --- INTERFACE UTILISATEUR (UI) ---
        function renderList() {
            const list = $('#participants-list');
            list.empty();
            if(participants.length === 0) {
                list.append('<li class="text-gray-400 text-center italic mt-4">Ajoutez des participants pour commencer.</li>');
            }
            participants.forEach((p, index) => {
                const itemClass = p.drawn ? 'participant-item drawn' : 'participant-item';
                const rankBadge = p.drawn ? `<span class="text-xs font-bold bg-yellow-500 text-black rounded-full px-2 py-0.5 mr-2">${p.rank}</span>` : '';
                list.append(`
                    <li class="${itemClass} flex items-center justify-between bg-gray-700 p-3 rounded-lg mb-2 shadow">
                        <div class="flex items-center">
                            <span class="w-4 h-4 rounded-full mr-3" style="background-color: ${p.color};"></span>
                            <div>${rankBadge}<span class="participant-name" contenteditable="true" data-index="${index}">${p.name}</span></div>
                        </div>
                        <button class="delete-btn" data-index="${index}" style="pointer-events: auto;">❌</button>
                    </li>
                `);
            });
        }

        // --- LOGIQUE 3D (THREE.JS) ---
        function createPieChart() {
            if (!font && participants.length > 0) return; // Attendre que la police soit chargée si nécessaire

            while (pieGroup.children.length) {
                pieGroup.remove(pieGroup.children[0]);
            }
            
            if (participants.length === 0) {
                const geometry = new THREE.CylinderGeometry(5, 5, 1, 64);
                const material = new THREE.MeshStandardMaterial({ color: '#4a5568', roughness: 0.8, metalness: 0.1 });
                const defaultPie = new THREE.Mesh(geometry, material);
                defaultPie.rotation.x = Math.PI / 2;

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = 512; canvas.height = 512;
                context.font = "bold 32px Poppins";
                context.fillStyle = "white";
                context.textAlign = "center";
                context.textBaseline = "middle";
                context.fillText("Ajoutez des participants", canvas.width / 2, canvas.height / 2);
                
                const texture = new THREE.CanvasTexture(canvas);
                const textMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
                const textPlane = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), textMaterial);
                textPlane.position.z = 0.55;
                
                defaultPie.add(textPlane);
                pieGroup.add(defaultPie);

            } else {
                const sliceAngle = (2 * Math.PI) / participants.length;
                const extrudeSettings = { depth: 1, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.1, bevelSegments: 2 };

                participants.forEach((p, i) => {
                    const shape = new THREE.Shape();
                    shape.moveTo(0, 0);
                    shape.absarc(0, 0, 5, i * sliceAngle, (i + 1) * sliceAngle, false);
                    shape.lineTo(0, 0);

                    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
                    const material = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.5, metalness: 0.1 });
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.userData = { id: i, name: p.name };
                    pieGroup.add(mesh);

                    // --- Créer le texte 3D pour le nom ---
                    const displayName = p.name.length > 10 ? p.name.substring(0, 9) + '.' : p.name;
                    const textGeometry = new THREE.TextGeometry(displayName, {
                        font: font,
                        size: 0.35,
                        height: 0.1,
                        curveSegments: 4,
                        bevelEnabled: false,
                    });
                    textGeometry.center(); // Centrer la géométrie pour une rotation correcte
                    
                    const textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
                    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
                    
                    const middleAngle = i * sliceAngle + sliceAngle / 2;
                    const radius = 3.5;
                    
                    textMesh.position.set(
                        Math.cos(middleAngle) * radius,
                        Math.sin(middleAngle) * radius,
                        1.2 // Hauteur au-dessus du camembert
                    );
                    
                    textMesh.rotation.z = middleAngle;

                    if (middleAngle > Math.PI / 2 && middleAngle < 3 * Math.PI / 2) {
                        textMesh.rotation.z += Math.PI; // Retourner le texte pour qu'il ne soit pas à l'envers
                    }

                    pieGroup.add(textMesh);
                });
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

            isSpinning = true;
            $('#draw-btn').prop('disabled', true).text('Tirage...');

            const winnerIndex = Math.floor(Math.random() * available.length);
            const winner = available[winnerIndex];
            const originalIndex = participants.findIndex(p => p.name === winner.name);
            
            const sliceAngle = (2 * Math.PI) / participants.length;
            const targetRotation = -((originalIndex * sliceAngle) + (sliceAngle / 2));
            
            gsap.to(pieGroup.rotation, {
                duration: 5,
                z: pieGroup.rotation.z + 10 * Math.PI + (targetRotation - (pieGroup.rotation.z % (2 * Math.PI))),
                ease: "power3.inOut",
                onComplete: () => {
                    isSpinning = false;
                    $('#draw-btn').prop('disabled', false).text('TIRER !');
                    winner.drawn = true;
                    drawCount++;
                    winner.rank = drawCount;
                    synth.triggerAttackRelease("C5", "0.5s");
                    updateAll();
                }
            });
        }
        
        // --- ANIMATION ET ÉVÉNEMENTS ---
        function animate() {
            requestAnimationFrame(animate);
            if (!isSpinning) {
                pieGroup.rotation.z += 0.002;
            }
            renderer.render(scene, camera);
        }

        function onWindowResize() {
            const newWidth = mainView.width();
            const newHeight = mainView.height();
            camera.aspect = newWidth / newHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(newWidth, newHeight);
        }
        
        function generateUniqueColor() {
            let color;
            do {
                color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
            } while (usedColors.includes(color));
            usedColors.push(color);
            return color;
        }

        // --- Écouteurs d'événements (JQuery) ---
        $('#add-btn').on('click', addParticipant);
        // $('#name-input').on('keypress', (e) => e.which === 13 && addParticipant());
        $('#participants-list').on('click', '.delete-btn', function() { deleteParticipant($(this).data('index')); });
        $('#draw-btn').on('click', startDraw);
        $(window).on('resize', onWindowResize);
        
        $('#participants-list').on('blur', '.participant-name', function() {
            const index = $(this).data('index');
            const newName = $(this).text().trim();
            if(!participants[index]) return;
            const oldName = participants[index].name;

            if (newName && oldName !== newName) {
                const isDuplicate = participants.some((p, i) => i !== index && p.name.toLowerCase() === newName.toLowerCase());
                if (!isDuplicate) {
                    participants[index].name = newName;
                    updateAll();
                } else { $(this).text(oldName); }
            } else if (!newName) { $(this).text(oldName); }
        });

        // --- CHARGEMENT DE LA POLICE ET DÉMARRAGE ---
        const fontLoader = new THREE.FontLoader();
        fontLoader.load('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/fonts/helvetiker_regular.typeface.json', (loadedFont) => {
            font = loadedFont;
            onWindowResize();
            updateAll();
            animate();
        });