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

// Gestion de mémoire
let participants = JSON.parse(localStorage.getItem('participants')) || [];
let usedColors = participants.map(p => p.color);
let isSpinning = false;
let drawCount = participants.filter(p => p.drawn).length;
let font = null;
let alertTimeout;
let lastWinnerMesh = null;
let isSoundEnabled = JSON.parse(localStorage.getItem('soundEnabled')) ?? false;
let tontineSettings = JSON.parse(localStorage.getItem('tontineSettings')) || {
    frequency: '7',
    amount: 0,
    startDate: '',
    participantCount: 0
};

const soundOnIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
const soundOffIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;

// --- GESTION DES PARTICIPANTS ---
function addParticipant() {
    if (tontineSettings.participantCount <= 0) {
        showAlert("Veuillez d'abord définir le nombre de participants dans les paramètres.");
        openSettingsModal();
        return;
    }
    const name = $('#name-input').val().trim();
    if (name === '') return;
    if (participants.find(p => p.name.toLowerCase() === name.toLowerCase())) { showAlert("Ce nom a déjà été ajouté !"); return; }
    if (participants.length >= tontineSettings.participantCount) { showAlert(`Le nombre maximum de participants (${tontineSettings.participantCount}) est atteint.`); return; }

    if (isSoundEnabled) notificationSound.triggerAttackRelease("C6", "0.2s");
    participants.push({ name: name, color: generateUniqueColor(), drawn: false, rank: null, tontineDate: '', paymentMethod: 'Telephone', interracValue: '', payout: 0 });
    $('#name-input').val('');
    updateAll();

    const newItem = $('#participants-list').children().last();
    if (newItem.length) {
        gsap.from(newItem, { duration: 0.8, scale: 0.5, opacity: 0, ease: 'bounce.out' });
    }
}
function deleteParticipant(element, index) {
    if (isSpinning) return;
    gsap.to(element, {
        duration: 0.5,
        scale: 0,
        opacity: 0,
        ease: 'power2.in',
        onComplete: () => {
            participants.splice(index, 1);
            usedColors = participants.map(p => p.color);
            updateAll();
        }
    });
}

// Réinitialisation des participants
function resetAll() {
    const drawnExists = participants.some(p => p.drawn);
    const notDrawnExists = participants.some(p => !p.drawn);
    let itemsToClear;

    if (drawnExists) {
        itemsToClear = $('#winners-list li');
        gsap.to(itemsToClear, {
            duration: 0.3,
            x: '-100%',
            opacity: 0,
            stagger: { amount: 0.5, from: "end" },
            onComplete: () => {
                participants.forEach(p => {
                    p.drawn = false;
                    p.rank = null;
                    p.tontineDate = '';
                });
                drawCount = 0;
                if (lastWinnerMesh) {
                    lastWinnerMesh.material.color.set(0xffffff);
                    lastWinnerMesh = null;
                }
                updateAll();
            }
        });
    } else if (notDrawnExists) {
        itemsToClear = $('#participants-list li');
        gsap.to(itemsToClear, {
            duration: 0.3,
            x: '-100%',
            opacity: 0,
            stagger: { amount: 0.5, from: "end" },
            onComplete: () => {
                participants = [];
                usedColors = [];
                updateAll();
            }
        });
    }
}

// Mise à jour du rendu global
function updateAll() {
    localStorage.setItem('participants', JSON.stringify(participants));
    localStorage.setItem('tontineSettings', JSON.stringify(tontineSettings));
    renderList();
    renderWinnersList();
    createPieChart();
    updateButtonStates();
}

// --- UI & MODALS ---
function renderList() {
    const list = $('#participants-list');
    list.empty();
    const notDrawn = participants.filter(p => !p.drawn);
    if (notDrawn.length === 0 && participants.length > 0) { list.append('<li class="text-green-400 text-center font-semibold mt-4">Tirage terminé !</li>'); }
    else if (participants.length === 0) { list.append('<li class="text-gray-400 text-center italic mt-4">Ajoutez des participants.</li>'); }
    else {
        notDrawn.forEach((p) => {
            const originalIndex = participants.indexOf(p);
            list.append(`<li class="participant-item flex items-center justify-between bg-gray-700 p-3 rounded-lg mb-2 shadow"><div class="flex items-center min-w-0"><span class="w-4 h-4 rounded-full mr-3 flex-shrink-0" style="background-color: ${p.color};"></span><div class="truncate"><span class="participant-name" contenteditable="true" data-index="${originalIndex}">${p.name}</span></div></div><button class="delete-btn flex-shrink-0" data-index="${originalIndex}" style="pointer-events: auto;">❌</button></li>`);
        });
    }
}

// Rendu de la liste des gagnants
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

// changement d'état des boutton à temps réel
function updateButtonStates() {
    const allDrawn = participants.length > 0 && participants.every(p => p.drawn);
    const drawnExists = participants.some(p => p.drawn);
    const maxReached = (tontineSettings.participantCount > 0 && participants.length >= tontineSettings.participantCount);
    $('#add-btn, #name-input').prop('disabled', maxReached || tontineSettings.participantCount === 0);
    $('#draw-btn').prop('disabled', allDrawn || participants.filter(p => !p.drawn).length === 0 || isSpinning);
    $('#pdf-btn, #copy-btn').prop('disabled', !drawnExists);
    $('#settings-btn').prop('disabled', drawnExists);
    $('#sound-toggle-btn').html(isSoundEnabled ? soundOnIcon : soundOffIcon);
}

// -- Affiche le modal masqué par défaut --
function showAlert(message) {
    const alertBox = $('#alert-message');
    alertBox.text(message).addClass('show');
    clearTimeout(alertTimeout);
    alertTimeout = setTimeout(() => { alertBox.removeClass('show'); }, 5000);
}

// permet d'apporter une modification sur chaque participant
function openEditModal(index) {
    const p = participants[index];
    if (!p) return;
    $('#edit-participant-index').val(index);
    $('#edit-name').val(p.name);
    $('#edit-tontine-date').val(p.tontineDate || '');
    $('#edit-tontine-date').attr('min', new Date().toISOString().split("T")[0]);
    const payout = (tontineSettings.participantCount - 1) * tontineSettings.amount;
    $('#edit-payout').val(formatCurrency(payout));
    $('#edit-payment-method').val(p.paymentMethod || 'Telephone').trigger('change');
    if (p.paymentMethod === 'Courriel') {
        $('#edit-email').val(p.interracValue || '');
    } else {
        $('#edit-phone').val(p.interracValue || '');
    }
    $('#edit-modal').removeClass('hidden');
}

function closeEditModal() {
    $('#edit-modal').addClass('hidden');
}

function openSettingsModal() {
    $('#settings-participant-count').val(tontineSettings.participantCount > 0 ? tontineSettings.participantCount : '');
    $('#settings-amount').val(tontineSettings.amount > 0 ? tontineSettings.amount : '');
    $('#settings-frequency').val(tontineSettings.frequency);
    $('#settings-start-date').val(tontineSettings.startDate);
    $('#settings-start-date').attr('min', new Date().toISOString().split("T")[0]);
    $('#settings-modal').removeClass('hidden');
}

function closeSettingsModal() { $('#settings-modal').addClass('hidden'); }

// Permet de gérer le formatage du champ télephone au format (xxx) xxx-xxxx
function formatPhoneNumber(value) {
    if (!value) return value;
    const phoneNumber = value.replace(/[^\d]/g, '');
    const phoneNumberLength = phoneNumber.length;
    if (phoneNumberLength < 4) return `(${phoneNumber}`;
    if (phoneNumberLength < 7) { return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`; }
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
}

function formatCurrency(value) {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(value);
}

// --- 3D & ANIMATIONS ---
function createPieChart() {
    if (!font) return;
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
    if (!tontineSettings.startDate || tontineSettings.amount <= 0 || tontineSettings.participantCount <= 0) {
        showAlert("Veuillez définir tous les paramètres de la tontine avant de commencer.");
        openSettingsModal();
        return;
    }

    if (isSpinning) return;

    const available = participants.filter(p => !p.drawn);

    if (available.length < 1) { return; }
    if (lastWinnerMesh) { lastWinnerMesh.material.color.set(0xffffff); gsap.to(lastWinnerMesh.scale, { x: 1, y: 1, z: 1, duration: 0.5 }); lastWinnerMesh = null; }

    isSpinning = true;
    updateButtonStates();
    $('#draw-btn').text('Tirage...');
    if (isSoundEnabled) { Tone.Transport.start(); rouletteLoop.start(0); }

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
            rouletteLoop.stop(); Tone.Transport.stop();
            isSpinning = false;
            winner.drawn = true;
            drawCount++;
            winner.rank = drawCount;

            if (winner.rank === 1) {
                winner.tontineDate = tontineSettings.startDate;
            } else {
                const prevWinner = participants.find(p => p.rank === winner.rank - 1);
                if (prevWinner && prevWinner.tontineDate) {
                    const prevDate = new Date(prevWinner.tontineDate + "T00:00:00");
                    if (tontineSettings.frequency === '30') {
                        prevDate.setMonth(prevDate.getMonth() + 1);
                    } else {
                        prevDate.setDate(prevDate.getDate() + parseInt(tontineSettings.frequency));
                    }
                    winner.tontineDate = prevDate.toISOString().slice(0, 10);
                }
            }

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
                if (winnerItem.length) {
                    winnerItem.addClass('item-shine-animation');
                    setTimeout(() => { winnerItem.removeClass('item-shine-animation'); }, 7000);
                }
            }, 1200);
        }
    });
}

// --- FONCTIONS D'EXPORT de données dans le pdf ---
function generatePDF() {
    const doc = new jsPDF();
    const drawn = participants.filter(p => p.drawn).sort((a, b) => a.rank - b.rank);
    const d = new Date();
    const today = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    const payout = (tontineSettings.participantCount - 1) * tontineSettings.amount;
    const body = drawn.map(p => ['', p.name, p.interracValue || '', formatCurrency(payout), p.tontineDate || today]);
    const dollarSign = "$";
    doc.setFontSize(34);
    doc.setTextColor(34, 139, 34);
    doc.text(dollarSign, 105, 20, { align: 'center' });
    doc.setTextColor(40);
    doc.setFontSize(22);
    doc.text("Résultats de la Tontine", 105, 35, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`Tirage du ${d.toLocaleDateString('fr-FR')}`, 105, 42, { align: 'center' });

    doc.autoTable({
        head: [['Rang', 'Nom', 'Contact (interrac)', 'Montant à recevoir', 'Date de la Tontine']],
        body: body,
        startY: 50,
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
        didDrawCell: (data) => {
            if (data.section === 'body' && data.column.index === 0) {
                const participant = drawn[data.row.index];
                const rankText = participant.rank.toString(); const circleRadius = 1.5; const spacing = 2;
                const textWidth = doc.getTextWidth(rankText); const totalContentWidth = circleRadius * 2 + spacing + textWidth;
                const startX = data.cell.x + (data.cell.width - totalContentWidth) / 2;
                doc.setFillColor(participant.color); doc.circle(startX + circleRadius, data.cell.y + data.cell.height / 2, circleRadius, 'F');
                doc.setFontSize(10); doc.setTextColor(44, 62, 80); doc.text(rankText, startX + circleRadius * 2 + spacing, data.cell.y + data.cell.height / 2, { baseline: 'middle', align: 'left' });
            }
        }
    });
    doc.save(`resultats_tirage_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// sert à copier les informations
function copyResults() {
    const drawn = participants.filter(p => p.drawn).sort((a, b) => a.rank - b.rank);
    const today = new Date().toLocaleDateString('fr-FR');
    const textToCopy = drawn.map(p => `${p.rank} . ${p.tontineDate || today} - ${p.name} - (${p.interracValue.replace(/\((\d{3})\)\s*(\d{3}-\d{4})/, '$1 - $2') || 'N/A'})`).join(';\n');
    const textarea = document.createElement('textarea');
    textarea.value = textToCopy;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy', true, textToCopy);
    document.body.removeChild(textarea);
    const copyBtn = $('#copy-btn');
    const originalIcon = copyBtn.html();
    copyBtn.html('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>');
    setTimeout(() => { copyBtn.html(originalIcon); }, 2000);
}

// --- TUTORIAL LOGIC ---
let currentStep = 0;
const tutorialSteps = [
    { element: '#settings-btn', text: "Bienvenue ! Cliquez ici pour définir les paramètres de votre tontine.", requireAction: true, action: 'click' },
    { element: '#settings-form', text: "Remplissez tous les champs, puis cliquez sur 'Enregistrer'.", requireAction: true, action: 'submit' },
    { element: '#name-input', text: "Excellent ! Maintenant, saisissez le nom du premier participant." },
    { element: '#add-btn', text: "Cliquez sur 'Ajouter' pour l'inclure dans la liste.", requireAction: true, action: 'click' },
    { element: '#draw-btn', text: "Une fois que tous les participants sont ajoutés, cliquez ici pour lancer le tirage !", requireAction: true, action: 'click', condition: () => participants.length > 0 },
    { element: '#winners-list', text: "Félicitations au gagnant ! Cliquez sur son nom pour modifier ses informations.", requireAction: true, action: 'click', optional: true, condition: () => participants.some(p => p.drawn) },
    { element: '#fab-container', text: "Enfin, utilisez ces boutons pour copier la liste ou la télécharger en PDF." },
    { element: 'footer', text: "Le tutoriel est terminé. Profitez bien de l'application !" }
];

function positionPopup(element) {
    const popup = $('#tutorial-popup');
    if (!element || !element.length) { popup.css({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }); return; }
    const targetRect = element[0].getBoundingClientRect();
    popup.css({ top: `${targetRect.bottom + 15}px`, left: `${targetRect.left + targetRect.width / 2 - popup.outerWidth() / 2}px`, });
    if (popup[0].getBoundingClientRect().right > window.innerWidth) { popup.css('left', `${window.innerWidth - popup.outerWidth() - 15}px`); }
    if (popup[0].getBoundingClientRect().left < 0) { popup.css('left', '15px'); }
    if (targetRect.bottom + popup.outerHeight() + 15 > window.innerHeight) { popup.css({ top: `${targetRect.top - popup.outerHeight() - 15}px` }); }
}

function showTutorialStep(stepIndex) {
    $('.tutorial-highlight').removeClass('tutorial-highlight');
    if (stepIndex >= tutorialSteps.length) { endTutorial(); return; }

    const step = tutorialSteps[stepIndex];
    if (step.condition && !step.condition()) {
        if (step.optional) { currentStep++; showTutorialStep(currentStep); return; }
        endTutorial(); return;
    }

    const targetElement = $(step.element);
    if (!targetElement.is(':visible')) { endTutorial(); return; }

    $('#tutorial-overlay').removeClass('hidden');
    targetElement.addClass('tutorial-highlight');
    $('#tutorial-text').text(step.text);
    positionPopup(targetElement);

    const advance = () => {
        $(document).off('.tutorial');
        $('#tutorial-next-btn').off('.tutorial');
        currentStep++;
        setTimeout(() => showTutorialStep(currentStep), 300);
    };

    if (step.requireAction) {
        $('#tutorial-next-btn').hide();
        $(document).one(step.action + ".tutorial", step.element, advance);
    } else {
        $('#tutorial-next-btn').show().one('click.tutorial', advance);
    }
}

function startTutorial() { currentStep = 0; showTutorialStep(currentStep); }
function endTutorial() {
    $('.tutorial-highlight').removeClass('tutorial-highlight');
    $('#tutorial-overlay').addClass('hidden');
    localStorage.setItem('tutorialCompleted', 'true');
}

$('#tutorial-skip-btn').on('click', endTutorial);

// --- BOUCLE PRINCIPALE ET ÉVÉNEMENTS ---
function animate() { requestAnimationFrame(animate); if (!isSpinning) { pieGroup.rotation.z += 0.002; } renderer.render(scene, camera); }
function onWindowResize() { const newWidth = mainView.width(); const newHeight = mainView.height(); camera.aspect = newWidth / newHeight; camera.updateProjectionMatrix(); renderer.setSize(newWidth, newHeight); }
function generateUniqueColor() { let color; do { color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'); } while (usedColors.includes(color)); usedColors.push(color); return color; }

$('#add-btn').on('click', addParticipant);
$('#reset-btn').on('click', resetAll);
$('#settings-btn').on('click', openSettingsModal);
$('#cancel-settings-btn').on('click', closeSettingsModal);
$('#sound-toggle-btn').on('click', () => {
    isSoundEnabled = !isSoundEnabled;
    localStorage.setItem('soundEnabled', JSON.stringify(isSoundEnabled));
    updateButtonStates();
});

$('#participants-list').on('click', '.delete-btn', function (e) {
    e.stopPropagation();
    const element = $(this).closest('li');
    const index = $(this).data('index');
    deleteParticipant(element, index);
});

$('#draw-btn').on('click', startDraw);
$('#pdf-btn').on('click', generatePDF);
$('#copy-btn').on('click', copyResults);
$(window).on('resize', onWindowResize);

$('#winners-list').on('click', 'li', function () { openEditModal($(this).data('index')); });
$('#cancel-edit-btn').on('click', closeEditModal);
$('#edit-payment-method').on('change', function () {
    const isEmail = $(this).val() === 'Courriel';
    $('#email-field-container').toggleClass('hidden', !isEmail);
    $('#phone-field-container').toggleClass('hidden', isEmail);
});
$('#edit-form').on('submit', function (e) {
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
$('#settings-form').on('submit', function (e) {
    e.preventDefault();
    $('.input-error').removeClass('input-error');
    let isValid = true;
    let count = parseInt($('#settings-participant-count').val()) || 0;
    if (count < 2 || count > 24) {
        $('#settings-participant-count').addClass('input-error');
        showAlert("Le nombre de participants doit être entre 2 et 24.");
        isValid = false;
    }
    if (count <= participants.length) 
        {
        $('#settings-participant-count').addClass('input-error');
        showAlert("Le nombre de participants ne peut pas être inférieur ou égale au nombre dejà présent dans ta liste!");
        isValid = false;
    }
    if (isValid) {
        tontineSettings.participantCount = count;
        tontineSettings.amount = parseFloat($('#settings-amount').val().replace(/[^0-9.]/g, '')) || 0;
        tontineSettings.frequency = $('#settings-frequency').val();
        tontineSettings.startDate = $('#settings-start-date').val();
        updateAll();
        closeSettingsModal();
    }
});
$('#settings-amount, #settings-participant-count').on('input', function () {
    let value = $(this).val().replace(/[^0-9]/g, '');
    $(this).val(value);
});
$('#edit-phone').on('input', function () {
    let value = $(this).val();
    $(this).val(formatPhoneNumber(value));
});
$('#participants-list').on('blur', '.participant-name', function (e) {
    const index = $(this).data('index'); const newName = $(this).text().trim(); if (!participants[index]) return; const oldName = participants[index].name;
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
    if (!localStorage.getItem('tutorialCompleted')) {
        setTimeout(startTutorial, 1000);
    }
});