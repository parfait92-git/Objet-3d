        // --- INITIALISATION ---
        const { jsPDF } = window.jspdf;
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

        // Sons
        const applauseSound = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0 } }).toDestination();
        const notificationSound = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.2, sustain: 0.1, release: 0.5 } }).toDestination();
        const rouletteClick = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.01, sustain: 0 } }).toDestination();
        const rouletteLoop = new Tone.Loop(time => {
            rouletteClick.triggerAttack(time);
        }, "16n").start(0);
        
        let participants = JSON.parse(localStorage.getItem('participants')) || [];
        let usedColors = participants.map(p => p.color);
        let isSpinning = false;
        let drawCount = participants.filter(p => p.drawn).length;
        let font = null;
        let alertTimeout;
        let lastWinnerMesh = null;
        let isSoundEnabled = true;

        const soundOnIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
        const soundOffIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;

        // --- GESTION DES PARTICIPANTS ---
        function addParticipant() {
            const name = $('#name-input').val().trim();
            if (name === '') return;
            if (participants.find(p => p.name.toLowerCase() === name.toLowerCase())) { showAlert("Ce nom a déjà été ajouté !"); return; }
            if (participants.length >= 10) { showAlert("Le nombre maximum de participants (10) est atteint."); return; }
            
            if (isSoundEnabled) notificationSound.triggerAttackRelease("C6", "0.2s");
            participants.push({ name: name, color: generateUniqueColor(), drawn: false, rank: null, tontineDate: '', paymentMethod: 'Telephone', interracValue: '' });
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
            if(notDrawn.length === 0 && participants.length > 0) { list.append('<li class="text-green-400 text-center font-semibold mt-4">Tirage terminé !</li>'); }
            else if (participants.length === 0) { list.append('<li class="text-gray-400 text-center italic mt-4">Ajoutez des participants.</li>'); }
            else {
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
                    const originalIndex = participants.indexOf(p);
                    list.append(`<li data-index="${originalIndex}" class="participant-item flex items-center bg-gray-700 p-3 rounded-lg mb-2 shadow cursor-pointer hover:bg-gray-600"><span class="text-lg font-bold text-yellow-400 mr-3 w-6 text-center">${p.rank}.</span><span class="w-4 h-4 rounded-full mr-3 flex-shrink-0" style="background-color: ${p.color};"></span><span>${p.name}</span></li>`);
                });
            }
        }
        function updateButtonStates() {
            const allDrawn = participants.length > 0 && participants.every(p => p.drawn);
            const drawnExists = participants.some(p => p.drawn);
            const maxReached = participants.length >= 10;
            $('#add-btn, #name-input').prop('disabled', maxReached);
            $('#draw-btn').prop('disabled', allDrawn || participants.filter(p=>!p.drawn).length === 0 || isSpinning);
            $('#pdf-btn, #copy-btn').prop('disabled', !drawnExists);
            $('#sound-toggle-btn').html(isSoundEnabled ? soundOnIcon : soundOffIcon);
        }
        function showAlert(message) {
            const alertBox = $('#alert-message');
            alertBox.text(message).addClass('show');
            clearTimeout(alertTimeout);
            alertTimeout = setTimeout(() => { alertBox.removeClass('show'); }, 5000);
        }

        // --- MODAL LOGIC ---
        function openEditModal(index) {
            const p = participants[index];
            if (!p) return;
            $('#edit-participant-index').val(index);
            $('#edit-name').val(p.name);
            $('#edit-tontine-date').val(p.tontineDate || '');
            $('#edit-payment-method').val(p.paymentMethod || 'Telephone').trigger('change');
            if (p.paymentMethod === 'Courriel') {
                $('#edit-email').val(p.interracValue || '');
            } else {
                $('#edit-phone').val(p.interracValue || '');
            }
            $('#edit-modal').removeClass('hidden');
        }
        function closeEditModal() { $('#edit-modal').addClass('hidden'); }
        function formatPhoneNumber(value) {
            if (!value) return value;
            const phoneNumber = value.replace(/[^\d]/g, '');
            const phoneNumberLength = phoneNumber.length;
            if (phoneNumberLength < 4) return phoneNumber;
            if (phoneNumberLength < 7) { return `(${phoneNumber.slice(0, 3)})-${phoneNumber.slice(3)}`;}
            return `(${phoneNumber.slice(0, 3)})-${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
        }
        $('#edit-phone').on('input', function(e) { $(this).val(formatPhoneNumber($(this).val())); });

        // --- 3D & ANIMATIONS ---
        function createPieChart() {
            if (!font && participants.length > 0) return;
            while (pieGroup.children.length) { pieGroup.remove(pieGroup.children[0]); }
            const activeParticipants = participants.filter(p => !p.drawn);
            if (activeParticipants.length === 0) {
                const geometry = new THREE.CylinderGeometry(5, 5, 1, 64);
                const material = new THREE.MeshStandardMaterial({ color: '#4a5568', roughness: 0.8, metalness: 0.1 });
                const defaultPie = new THREE.Mesh(geometry, material);
                defaultPie.rotation.x = Math.PI / 2;
                const canvas = document.createElement('canvas'); const context = canvas.getContext('2d');
                canvas.width = 512; canvas.height = 512; context.font = "bold 32px Poppins";
                context.fillStyle = "white"; context.textAlign = "center"; context.textBaseline = "middle";
                const defaultText = participants.length > 0 ? "Tirage Terminé !" : "Ajoutez des participants";
                context.fillText(defaultText, canvas.width / 2, canvas.height / 2);
                const texture = new THREE.CanvasTexture(canvas);
                const textMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
                const textPlane = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), textMaterial);
                textPlane.position.z = 0.55;
                defaultPie.add(textPlane); pieGroup.add(defaultPie);
            } else {
                const sliceAngle = (2 * Math.PI) / activeParticipants.length;
                activeParticipants.forEach((p, i) => {
                    const shape = new THREE.Shape();
                    shape.moveTo(0, 0); shape.absarc(0, 0, 5, i * sliceAngle, (i + 1) * sliceAngle, false); shape.lineTo(0, 0);
                    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.1, bevelSegments: 2 });
                    const material = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.5, metalness: 0.1 });
                    const sliceMesh = new THREE.Mesh(geometry, material);
                    sliceMesh.userData = { nameRef: p.name }; pieGroup.add(sliceMesh);
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
        const light = new THREE.PointLight(0xffffff, 1, 100); light.position.set(0, 10, 10); scene.add(light);
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
            if (isSoundEnabled) {
                Tone.Transport.start();
                rouletteLoop.start(0);
            }

            const winner = available[Math.floor(Math.random() * available.length)];
            const winnerIndexInActive = available.indexOf(winner);
            const sliceAngle = (2 * Math.PI) / available.length;
            const middleAngle = (winnerIndexInActive * sliceAngle) + (sliceAngle / 2);
            const targetRotation = Math.PI - middleAngle;
            gsap.to(pieGroup.rotation, {
                duration: 5,
                z: pieGroup.rotation.z + 10 * Math.PI + (targetRotation - (pieGroup.rotation.z % (2 * Math.PI))),
                ease: "power3.inOut",
                onComplete: () => {
                    rouletteLoop.stop();
                    Tone.Transport.stop();
                    isSpinning = false;
                    winner.drawn = true; drawCount++; winner.rank = drawCount;
                    if (isSoundEnabled) { for (let i = 0; i < 30; i++) { setTimeout(() => applauseSound.triggerAttack(), i * 30); } }
                    triggerConfetti();
                    lastWinnerMesh = pieGroup.children.find(c => c.userData.nameRef === winner.name && c.type === 'Mesh' && c.geometry.type === 'TextGeometry');
                    if (lastWinnerMesh) {
                        gsap.to(lastWinnerMesh.scale, { x: 1.5, y: 1.5, z: 1.5, duration: 0.5, ease: "power2.out" });
                        lastWinnerMesh.material.color.set(0xffff00);
                    }
                    setTimeout(() => {
                        updateAll();
                        const winnerIndex = participants.findIndex(p => p.name === winner.name);
                        const winnerItem = $(`#winners-list li[data-index='${winnerIndex}']`);
                        if(winnerItem.length) {
                            winnerItem.addClass('item-glow-animation');
                            setTimeout(() => { winnerItem.removeClass('item-glow-animation'); }, 5000);
                        }
                    }, 1200);
                }
            });
        }

        // --- FONCTIONS D'EXPORT ---
        function generatePDF() {
            const doc = new jsPDF();
            const drawn = participants.filter(p => p.drawn).sort((a, b) => a.rank - b.rank);
            const d = new Date();
            const today = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
            const body = drawn.map(p => ['', p.name, p.interracValue || '', p.tontineDate || today]);
            doc.setFontSize(22); doc.text("Résultats du Tirage au Sort", 105, 20, { align: 'center' });
            doc.setFontSize(12); doc.text(`Tirage du ${d.toLocaleDateString('fr-FR')}`, 105, 28, { align: 'center' });
            doc.autoTable({
                head: [['Rang', 'Nom', 'interrac', 'Date']], body: body, startY: 35, theme: 'grid',
                didDrawCell: (data) => {
                    if (data.section === 'body' && data.column.index === 0) {
                        const participant = drawn[data.row.index];
                        const rankText = participant.rank.toString(); const circleRadius = 1.5; const spacing = 2;
                        const textWidth = doc.getTextWidth(rankText); const totalContentWidth = circleRadius*2 + spacing + textWidth;
                        const startX = data.cell.x + (data.cell.width - totalContentWidth) / 2;
                        doc.setFillColor(participant.color); doc.circle(startX + circleRadius, data.cell.y + data.cell.height / 2, circleRadius, 'F');
                        doc.setFontSize(10); doc.setTextColor(44, 62, 80); doc.text(rankText, startX + circleRadius*2 + spacing, data.cell.y + data.cell.height / 2, { baseline: 'middle', align: 'left' });
                    }
                }
            });
            doc.save(`resultats_tirage_${new Date().toISOString().slice(0,10)}.pdf`);
        }
        function copyResults() {
            const drawn = participants.filter(p => p.drawn).sort((a, b) => a.rank - b.rank);
            const today = new Date().toLocaleDateString('fr-FR');
            const text = drawn.map(p => `Tour: ${p.rank}, Nom: ${p.name}, Date: ${p.tontineDate || today}`).join('\n');
            const textarea = document.createElement('textarea');
            textarea.value = text; document.body.appendChild(textarea);
            textarea.select(); document.execCommand('copy'); document.body.removeChild(textarea);
            const copyBtn = $('#copy-btn'); const originalIcon = copyBtn.html();
            copyBtn.html('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>');
            setTimeout(() => { copyBtn.html(originalIcon); }, 2000);
        }
        
        // --- BOUCLE PRINCIPALE ET ÉVÉNEMENTS ---
        function animate() { requestAnimationFrame(animate); if (!isSpinning) { pieGroup.rotation.z += 0.002; } renderer.render(scene, camera); }
        function onWindowResize() { const newWidth = mainView.width(); const newHeight = mainView.height(); camera.aspect = newWidth / newHeight; camera.updateProjectionMatrix(); renderer.setSize(newWidth, newHeight); }
        function generateUniqueColor() { let color; do { color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'); } while (usedColors.includes(color)); usedColors.push(color); return color; }

        $('#add-btn').on('click', addParticipant);
        $('#reset-btn').on('click', resetAll);
        $('#sound-toggle-btn').on('click', () => { isSoundEnabled = !isSoundEnabled; updateButtonStates(); });
        $('#participants-list').on('click', '.delete-btn', function(e) { e.stopPropagation(); deleteParticipant($(this).data('index')); });
        $('#draw-btn').on('click', startDraw);
        $('#pdf-btn').on('click', generatePDF);
        $('#copy-btn').on('click', copyResults);
        $(window).on('resize', onWindowResize);
        
        $('#winners-list').on('click', 'li', function() { openEditModal($(this).data('index')); });
        $('#cancel-edit-btn').on('click', closeEditModal);
        $('#edit-payment-method').on('change', function() {
            const isEmail = $(this).val() === 'Courriel';
            $('#email-field-container').toggleClass('hidden', !isEmail);
            $('#phone-field-container').toggleClass('hidden', isEmail);
        });
        $('#edit-form').on('submit', function(e) {
            e.preventDefault();
            $('.input-error').removeClass('input-error');
            let isValid = true;
            const name = $('#edit-name').val().trim();
            const tontineDate = $('#edit-tontine-date').val();
            const paymentMethod = $('#edit-payment-method').val();
            const email = $('#edit-email').val().trim();
            const phone = $('#edit-phone').val().trim();

            if (!name) { $('#edit-name').addClass('input-error'); isValid = false; }
            if (!tontineDate) { $('#edit-tontine-date').addClass('input-error'); isValid = false; }
            if (paymentMethod === 'Courriel' && !email) { $('#edit-email').addClass('input-error'); isValid = false; }
            if (paymentMethod === 'Telephone' && !phone) { $('#edit-phone').addClass('input-error'); isValid = false; }
            
            if (isValid) {
                const index = $('#edit-participant-index').val();
                participants[index].name = name;
                participants[index].tontineDate = tontineDate;
                participants[index].paymentMethod = paymentMethod;
                participants[index].interracValue = (paymentMethod === 'Courriel') ? email : phone;
                updateAll();
                closeEditModal();
            }
        });
        
        $('#participants-list').on('blur', '.participant-name', function(e) {
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