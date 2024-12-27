// Data management
/**
 * Your friendly deck manager! 📚
 * 
 * Takes care of:
 * - Creating and deleting decks
 * - Adding and removing cards
 * - Tracking deck mastery
 * - Saving and loading data
 */
class DeckManager {
    constructor() {
        this.decks = JSON.parse(localStorage.getItem('decks')) || [];
        this.currentDeckIndex = -1;
        this.currentCardIndex = -1;
        this.stats = new Statistics();
        this.loadStats();
    }

    loadStats() {
        const savedStats = JSON.parse(localStorage.getItem('studyStats'));
        if (savedStats) {
            Object.assign(this.stats, savedStats);
        }
    }

    saveStats() {
        localStorage.setItem('studyStats', JSON.stringify(this.stats));
    }

    createDeck(name, cards) {
        const deck = {
            id: Date.now(),
            name,
            cards,
            mastery: 0,
            lastStudied: null
        };
        this.decks.push(deck);
        this.saveDecksToDB();

        if (this.decks.length === 1) {
            this.stats.earnAchievement(Achievement.ACHIEVEMENTS.FIRST_DECK);
        }
        return deck;
    }

    deleteDeck(deckId) {
        this.decks = this.decks.filter(deck => deck.id !== deckId);
        this.saveDecksToDB();
    }

    updateDeck(deckId, updates) {
        const index = this.decks.findIndex(deck => deck.id === deckId);
        if (index !== -1) {
            this.decks[index] = { ...this.decks[index], ...updates };
            this.saveDecksToDB();
        }
    }

    saveDecksToDB() {
        localStorage.setItem('decks', JSON.stringify(this.decks));
    }

    setCurrentDeck(index) {
        this.currentDeckIndex = index;
        this.currentCardIndex = 0;
        return this.decks[index];
    }

    getCurrentDeck() {
        return this.currentDeckIndex !== -1 ? this.decks[this.currentDeckIndex] : null;
    }

    getCurrentCard() {
        const deck = this.getCurrentDeck();
        return deck && this.currentCardIndex !== -1 ? deck.cards[this.currentCardIndex] : null;
    }

    nextCard() {
        const deck = this.getCurrentDeck();
        if (deck && this.currentCardIndex < deck.cards.length - 1) {
            this.currentCardIndex++;
            return true;
        }
        return false;
    }

    previousCard() {
        if (this.currentCardIndex > 0) {
            this.currentCardIndex--;
            return true;
        }
        return false;
    }

    updateCardMastery(confidence) {
        const deck = this.getCurrentDeck();
        const card = this.getCurrentCard();
        if (!deck || !card) return;

        card.reviewCount = card.reviewCount || 0;
        card.reviewCount++;
        card.lastReviewed = new Date().toISOString();
        card.reviewHistory = card.reviewHistory || [];
        
        // Enhanced mastery calculation
        const masteryFactors = {
            time: 0.3,      // Time since last review
            confidence: 0.4, // User's confidence rating
            consistency: 0.3 // Consistency of high ratings
        };

        // Calculate time decay (exponential decay over 30 days)
        const daysSinceLastReview = card.lastReviewed ? 
            (Date.now() - new Date(card.lastReviewed).getTime()) / (1000 * 60 * 60 * 24) : 30;
        const timeDecay = Math.exp(-daysSinceLastReview / 30);

        // Calculate confidence impact (1-3 scale, weighted by recency)
        const confidenceImpact = (confidence - 1) / 2;
        
        // Update review history with timestamp
        card.reviewHistory.push({
            confidence,
            timestamp: Date.now()
        });
        
        // Keep last 10 reviews
        if (card.reviewHistory.length > 10) {
            card.reviewHistory.shift();
        }

        // Calculate consistency (weighted average of recent reviews)
        const consistencyScore = card.reviewHistory.reduce((sum, review, index) => {
            const weight = Math.exp(-index / card.reviewHistory.length); // More recent reviews have higher weight
            return sum + ((review.confidence - 1) / 2) * weight;
        }, 0) / card.reviewHistory.reduce((sum, _, index) => 
            sum + Math.exp(-index / card.reviewHistory.length), 0);

        // Calculate new mastery with smoothing
        const newMastery = 
            (timeDecay * masteryFactors.time) +
            (confidenceImpact * masteryFactors.confidence) +
            (consistencyScore * masteryFactors.consistency);

        // Smooth the transition (more weight to new value if confidence is high)
        const smoothingFactor = 0.3 + (confidence - 1) * 0.1;
        card.mastery = card.mastery || 0;
        card.mastery = card.mastery * (1 - smoothingFactor) + newMastery * smoothingFactor;

        // Update deck mastery (weighted by review count)
        const totalReviews = deck.cards.reduce((sum, c) => sum + (c.reviewCount || 0), 0);
        deck.mastery = deck.cards.reduce((sum, c) => {
            const weight = ((c.reviewCount || 0) + 1) / (totalReviews + deck.cards.length);
            return sum + (c.mastery || 0) * weight;
        }, 0);

        // Check for achievements
        if (card.mastery >= 0.9) {
            this.stats.earnAchievement(Achievement.ACHIEVEMENTS.CARD_MASTERED);
        }
        
        this.saveDecksToDB();
        this.updateMasteryUI(card.mastery);
        return card.mastery;
    }

    updateMasteryUI(mastery) {
        const masteryProgress = document.getElementById('masteryProgress');
        const masteryPercentage = document.getElementById('masteryPercentage');
        if (masteryProgress && masteryPercentage) {
            // Animate the mastery progress
            const currentWidth = parseFloat(masteryProgress.style.width) || 0;
            const targetWidth = mastery * 100;
            
            // Smooth animation
            const animate = (start, end, duration) => {
                const startTime = performance.now();
                
                const update = (currentTime) => {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    
                    // Easing function for smooth animation
                    const eased = progress < .5 ? 
                        2 * progress * progress : 
                        -1 + (4 - 2 * progress) * progress;
                    
                    const current = start + (end - start) * eased;
                    masteryProgress.style.width = `${current}%`;
                    masteryPercentage.textContent = `${Math.round(current)}%`;
                    
                    if (progress < 1) {
                        requestAnimationFrame(update);
                    }
                };
                
                requestAnimationFrame(update);
            };
            
            animate(currentWidth, targetWidth, 500);
        }
    }

    calculateStudyTime(deck) {
        if (!deck) return 1500; // default 25 minutes
        
        // Base time per card (30 seconds)
        const baseTimePerCard = 30;
        
        // Additional time based on card complexity and mastery
        const totalTime = deck.cards.reduce((time, card) => {
            // Add more time for cards with lower mastery
            const masteryFactor = 1 + (1 - (card.mastery || 0));
            // Add more time for longer content
            const complexityFactor = 1 + 
                (Math.min(card.question.length + card.answer.length, 500) / 500);
            
            return time + (baseTimePerCard * masteryFactor * complexityFactor);
        }, 0);

        // Convert to seconds and round to nearest 5 minutes
        const totalMinutes = Math.ceil(totalTime / 60 / 5) * 5;
        return Math.min(Math.max(totalMinutes * 60, 300), 3600); // between 5 and 60 minutes
    }

    getStudyRecommendation(card) {
        if (!card) return '';
        
        const mastery = card.mastery || 0;
        const daysSinceLastReview = card.lastReviewed ? 
            (Date.now() - new Date(card.lastReviewed).getTime()) / (1000 * 60 * 60 * 24) : Infinity;

        if (mastery < 0.3) {
            return 'Focus needed: Review this card frequently';
        } else if (mastery < 0.6) {
            return 'Making progress: Review every few days';
        } else if (mastery < 0.9) {
            return 'Almost there: Review weekly';
        } else {
            return 'Well learned: Review monthly to maintain';
        }
    }

    checkMasteryAchievements(deck) {
        if (deck.mastery >= 1) {
            this.stats.earnAchievement(Achievement.ACHIEVEMENTS.MASTERY_LEVEL);
        }
    }

    shuffleDeck() {
        const deck = this.getCurrentDeck();
        if (!deck) return;

        // Fisher-Yates shuffle
        for (let i = deck.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck.cards[i], deck.cards[j]] = [deck.cards[j], deck.cards[i]];
        }
        
        this.currentCardIndex = 0;
        this.saveDecksToDB();
        this.showCurrentCard();
    }

    startStudySession() {
        const deck = this.getCurrentDeck();
        if (!deck) return;

        deck.lastStudied = new Date().toISOString();
        this.stats.updateStreak();
        this.timer.start();
        
        // Update UI
        this.updateMasteryIndicators();
        this.updateFocusModeUI();
    }

    endStudySession() {
        const deck = this.getCurrentDeck();
        if (!deck || !this.timer.isRunning) return;

        const duration = this.timer.totalTime - this.timer.timeLeft;
        const cardsReviewed = deck.cards.filter(card => card.lastReviewed).length;
        
        this.stats.addStudySession(duration, cardsReviewed);
        this.timer.stop();
        this.timer.reset();
        
        // Check achievements
        if (cardsReviewed >= 10) {
            this.stats.earnAchievement(Achievement.ACHIEVEMENTS.STUDY_SESSION);
        }
        this.deckManager.checkMasteryAchievements(deck);
    }

    importCardsFromCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const rows = text.split('\n');
                    const cards = rows.map(row => {
                        const [question, answer] = row.split(',').map(cell => cell.trim());
                        return { question, answer };
                    }).filter(card => card.question && card.answer);
                    resolve(cards);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }
}

// Timer functionality
/**
 * Your friendly study timer! ⏱️
 * 
 * Takes care of:
 * - Tracking study time
 * - Suggesting breaks
 * - Keeping you focused
 * - Celebrating your progress
 */
class StudyTimer {
    constructor(displayElement, progressBar) {
        this.display = displayElement;
        this.progressBar = progressBar;
        this.totalTime = 25 * 60; // 25 minutes in seconds
        this.timeLeft = this.totalTime;
        this.isRunning = false;
        this.timer = null;
        this.breakTime = 5 * 60; // 5 minutes break
        this.isBreak = false;
        this.sessionCount = 0;
        this.notifications = [];
    }

    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.timer = setInterval(() => this.tick(), 1000);
            this.showNotification('Study session started!');
        }
    }

    stop() {
        if (this.isRunning) {
            this.isRunning = false;
            clearInterval(this.timer);
            this.showNotification('Session paused');
        }
    }

    reset() {
        this.stop();
        this.timeLeft = this.totalTime;
        this.isBreak = false;
        this.updateDisplay();
        this.updateProgress();
        this.showNotification('Timer reset');
    }

    tick() {
        if (this.timeLeft > 0) {
            this.timeLeft--;
            this.updateDisplay();
            this.updateProgress();

            // Show time warnings
            if (!this.isBreak) {
                if (this.timeLeft === 300) { // 5 minutes left
                    this.showNotification('5 minutes remaining in your study session!');
                } else if (this.timeLeft === 60) { // 1 minute left
                    this.showNotification('1 minute remaining!');
                }
            }
        } else {
            this.stop();
            if (!this.isBreak) {
                this.sessionCount++;
                if (this.sessionCount % 4 === 0) {
                    // Longer break after 4 sessions
                    this.timeLeft = this.breakTime * 2;
                    this.showNotification('Great work! Take a longer break (10 minutes)');
                } else {
                    this.timeLeft = this.breakTime;
                    this.showNotification('Study session complete! Take a 5-minute break');
                }
                this.isBreak = true;
            } else {
                this.timeLeft = this.totalTime;
                this.isBreak = false;
                this.showNotification('Break time is over. Ready to start studying again?');
            }
            this.updateDisplay();
            this.updateProgress();
        }
    }

    updateDisplay() {
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        this.display.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Update timer color based on state
        this.display.className = this.isBreak ? 'timer-break' : 
            (this.timeLeft < 300 ? 'timer-warning' : 'timer-normal');
    }

    updateProgress() {
        const total = this.isBreak ? this.breakTime : this.totalTime;
        const progress = ((total - this.timeLeft) / total) * 100;
        this.progressBar.style.width = `${progress}%`;
        
        // Update progress bar color
        this.progressBar.className = `progress-bar ${this.isBreak ? 'break' : 
            (this.timeLeft < 300 ? 'warning' : 'normal')}`;
    }

    setDuration(time) {
        this.totalTime = time;
        this.timeLeft = time;
        this.updateDisplay();
        this.updateProgress();
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'timer-notification';
        notification.textContent = message;
        document.body.appendChild(notification);

        // Animate notification
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        // Remove notification after animation
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);

        // Store notification for cleanup
        this.notifications.push(notification);
    }

    cleanup() {
        // Remove any existing notifications
        this.notifications.forEach(notification => {
            if (document.body.contains(notification)) {
                notification.remove();
            }
        });
        this.notifications = [];
    }
}

// UI Controller
/**
 * Your friendly UI controller! 📊
 * 
 * Takes care of:
 * - Setting up event listeners
 * - Rendering decks and cards
 * - Handling user interactions
 * - Updating the UI
 */
class UIController {
    constructor() {
        this.deckManager = new DeckManager();
        this.setupEventListeners();
        this.setupTimer();
        this.renderDecks();
        this.initTour(); // Initialize the tour
    }

    initTour() {
        const tour = new Shepherd.Tour({
            useModalOverlay: true,
            defaultStepOptions: {
                classes: 'shepherd-theme-custom',
                scrollTo: { behavior: 'smooth', block: 'center' },
                modalOverlayOpeningPadding: 4,
                cancelIcon: {
                    enabled: true
                }
            }
        });

        const steps = [
            {
                id: 'welcome',
                title: 'Welcome to StudyMaster Pro! 👋',
                text: 'Let\'s take a quick tour to help you get started with your study journey.',
                buttons: [
                    {
                        text: 'Skip Tour',
                        action: tour.complete,
                        classes: 'shepherd-button-skip'
                    },
                    {
                        text: 'Start Tour',
                        action: tour.next,
                        classes: 'shepherd-button-next'
                    }
                ]
            },
            {
                id: 'create-deck',
                title: 'Create Your First Deck',
                attachTo: {
                    element: '#createDeckBtn',
                    on: 'bottom'
                },
                text: 'Start by creating a new deck of flashcards. Click here to create your first deck!',
                highlightClass: 'shepherd-highlight'
            },
            {
                id: 'study-timer',
                title: 'Track Your Progress',
                attachTo: {
                    element: '#timer',
                    on: 'bottom'
                },
                text: 'Use the study timer to track your study sessions and maintain focus.',
                highlightClass: 'shepherd-highlight'
            },
            {
                id: 'focus-mode',
                title: 'Focus Mode',
                attachTo: {
                    element: '#enterFocusMode',
                    on: 'bottom'
                },
                text: 'Enter focus mode for distraction-free studying. Perfect for intense study sessions!',
                highlightClass: 'shepherd-highlight'
            },
            {
                id: 'keyboard-shortcuts',
                title: 'Keyboard Shortcuts',
                text: `Quick tips for power users:
                    • Space: Flip card
                    • ←/→: Navigate cards
                    • 1/2/3: Rate confidence
                    • Esc: Exit focus mode`,
                buttons: [
                    {
                        text: 'Back',
                        action: tour.back,
                        classes: 'shepherd-button-secondary'
                    },
                    {
                        text: 'Finish',
                        action: tour.complete,
                        classes: 'shepherd-button-next'
                    }
                ]
            }
        ];

        steps.forEach(step => {
            const commonButtons = step.buttons || [
                {
                    text: 'Back',
                    action: tour.back,
                    classes: 'shepherd-button-secondary'
                },
                {
                    text: 'Next',
                    action: tour.next,
                    classes: 'shepherd-button-next'
                }
            ];
            tour.addStep({
                ...step,
                buttons: commonButtons
            });
        });

        // Cleanup function to remove overlay
        const cleanup = () => {
            const overlay = document.querySelector('.shepherd-modal-overlay-container');
            if (overlay) {
                overlay.remove();
            }
            document.body.classList.remove('shepherd-completed');
            localStorage.setItem('tourCompleted', 'true');
        };

        // Handle tour completion
        tour.on('complete', () => {
            cleanup();
            // Show welcome achievement
            this.deckManager.stats.earnAchievement({
                id: 'tour_complete',
                name: 'Ready to Learn',
                description: 'Completed the app tour',
                points: 5
            });
        });

        // Handle tour cancellation
        tour.on('cancel', cleanup);

        // Start tour if first visit
        if (!localStorage.getItem('tourCompleted') && this.deckManager.decks.length === 0) {
            setTimeout(() => {
                tour.start();
                document.body.classList.add('shepherd-active');
            }, 500);
        }
    }

    setupTimer() {
        const timerDisplay = document.getElementById('timer');
        const progressBar = document.getElementById('progress');
        this.timer = new StudyTimer(timerDisplay, progressBar);

        document.getElementById('startTimer').addEventListener('click', () => {
            if (!this.timer.isRunning) {
                this.timer.start();
            } else {
                this.timer.stop();
            }
        });

        document.getElementById('resetTimer').addEventListener('click', () => {
            this.timer.reset();
        });
    }

    setupEventListeners() {
        // Flashcard flip functionality
        const flashcard = document.getElementById('flashcard');
        
        // Mouse click flip
        flashcard.addEventListener('click', (e) => {
            // Don't flip if clicking confidence buttons
            if (e.target.closest('.confidence-buttons')) return;
            this.flipCard();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (!this.deckManager.getCurrentCard()) return;

            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    this.flipCard();
                    break;
                case 'ArrowLeft':
                    this.previousCard();
                    break;
                case 'ArrowRight':
                    this.nextCard();
                    break;
                case 'Digit1':
                case 'Numpad1':
                    if (flashcard.classList.contains('is-flipped')) {
                        this.handleConfidence(1);
                    }
                    break;
                case 'Digit2':
                case 'Numpad2':
                    if (flashcard.classList.contains('is-flipped')) {
                        this.handleConfidence(2);
                    }
                    break;
                case 'Digit3':
                case 'Numpad3':
                    if (flashcard.classList.contains('is-flipped')) {
                        this.handleConfidence(3);
                    }
                    break;
            }
        });

        // Touch swipe support
        let touchStartX = 0;
        let touchEndX = 0;
        
        flashcard.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        });

        flashcard.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            this.handleSwipe();
        });

        // Navigation buttons
        document.getElementById('prevCard').addEventListener('click', () => this.previousCard());
        document.getElementById('nextCard').addEventListener('click', () => this.nextCard());

        // Deck creation
        document.getElementById('createDeckBtn').addEventListener('click', () => this.showDeckModal());
        document.getElementById('deckForm').addEventListener('submit', (e) => this.handleDeckSubmit(e));
        document.getElementById('addCardBtn').addEventListener('click', () => this.addCardInputs());

        // Modal close button
        document.querySelector('.close-btn').addEventListener('click', () => {
            document.getElementById('deckModal').style.display = 'none';
        });

        // Anki import/export
        document.getElementById('exportAnki').addEventListener('click', () => {
            AnkiConverter.exportToAnki(this.deckManager.decks);
        });

        document.getElementById('importAnki').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.txt';
            input.onchange = async (e) => {
                try {
                    const decks = await AnkiConverter.importFromAnki(e.target.files[0]);
                    decks.forEach(deck => {
                        this.deckManager.createDeck(deck.name, deck.cards);
                    });
                    this.renderDecks();
                    alert(`Successfully imported ${decks.length} deck(s)`);
                } catch (error) {
                    alert('Error importing Anki file: ' + error.message);
                }
            };
            input.click();
        });

        // Focus mode
        const enterFocusBtn = document.getElementById('enterFocusMode');
        const exitFocusBtn = document.getElementById('exitFocusMode');
        const focusModeContainer = document.getElementById('focusModeContainer');

        enterFocusBtn.addEventListener('click', () => {
            this.enterFocusMode();
        });

        exitFocusBtn.addEventListener('click', () => {
            focusModeContainer.style.display = 'none';
            document.body.style.overflow = 'auto';
        });

        // Focus mode keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Escape' && focusModeContainer.style.display === 'flex') {
                exitFocusBtn.click();
            }
        });

        // Study session controls
        document.getElementById('startTimer').addEventListener('click', () => {
            if (!this.timer.isRunning) {
                this.startStudySession();
                document.getElementById('startTimer').innerHTML = '<i class="fas fa-pause"></i>';
            } else {
                this.timer.stop();
                document.getElementById('startTimer').innerHTML = '<i class="fas fa-play"></i>';
            }
        });

        document.getElementById('resetTimer').addEventListener('click', () => {
            if (this.timer.isRunning) {
                this.endStudySession();
            }
            this.timer.reset();
            document.getElementById('startTimer').innerHTML = '<i class="fas fa-play"></i>';
        });

        // Stats modal
        const statsModal = document.getElementById('statsModal');
        document.getElementById('statsBtn').addEventListener('click', () => {
            statsModal.style.display = 'block';
            this.updateStudyStats();
        });

        // Close modal on X button click
        statsModal.querySelector('.close-btn').addEventListener('click', () => {
            statsModal.style.display = 'none';
        });

        // Close modal on outside click
        statsModal.addEventListener('click', (e) => {
            if (e.target === statsModal) {
                statsModal.style.display = 'none';
            }
        });

        // Close modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && statsModal.style.display === 'block') {
                statsModal.style.display = 'none';
            }
        });

        // Shuffle button
        document.getElementById('shuffleCards').addEventListener('click', () => {
            this.deckManager.shuffleDeck();
            this.showCurrentCard();
        });

        // Focus mode session handling
        document.getElementById('enterFocusMode').addEventListener('click', () => {
            if (!this.timer.isRunning) {
                this.startStudySession();
            }
        });

        document.getElementById('exitFocusMode').addEventListener('click', () => {
            if (this.timer.isRunning) {
                this.endStudySession();
            }
        });

        // Search functionality
        document.getElementById('searchDecks').addEventListener('input', (e) => {
            this.searchDecks(e.target.value);
        });
    }

    enterFocusMode() {
        const focusModeContainer = document.getElementById('focusModeContainer');
        const mainFlashcard = document.getElementById('flashcard');
        const focusFlashcardContainer = focusModeContainer.querySelector('.flashcard-container');
        
        // Clone the flashcard and its content
        const clonedFlashcard = mainFlashcard.cloneNode(true);
        focusFlashcardContainer.innerHTML = '';
        focusFlashcardContainer.appendChild(clonedFlashcard);
        
        // Setup focus mode controls and event listeners
        const focusCard = focusFlashcardContainer.querySelector('.flashcard');
        
        // Card flip on click
        focusCard.addEventListener('click', (e) => {
            if (e.target.closest('.confidence-buttons')) return;
            this.flipFocusCard();
        });

        // Keyboard controls
        const keyHandler = (e) => {
            if (!this.deckManager.getCurrentCard()) return;

            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    this.flipFocusCard();
                    break;
                case 'ArrowLeft':
                    this.previousFocusCard();
                    break;
                case 'ArrowRight':
                    this.nextFocusCard();
                    break;
                case 'Digit1':
                case 'Numpad1':
                    if (focusCard.classList.contains('is-flipped')) {
                        this.handleConfidence(1);
                        this.nextFocusCard();
                    }
                    break;
                case 'Digit2':
                case 'Numpad2':
                    if (focusCard.classList.contains('is-flipped')) {
                        this.handleConfidence(2);
                        this.nextFocusCard();
                    }
                    break;
                case 'Digit3':
                case 'Numpad3':
                    if (focusCard.classList.contains('is-flipped')) {
                        this.handleConfidence(3);
                        this.nextFocusCard();
                    }
                    break;
            }
        };
        
        document.addEventListener('keydown', keyHandler);
        focusModeContainer.dataset.keyHandler = true;
        
        // Navigation buttons
        document.getElementById('focusPrevCard').addEventListener('click', () => this.previousFocusCard());
        document.getElementById('focusNextCard').addEventListener('click', () => this.nextFocusCard());
        
        focusModeContainer.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        this.updateFocusModeUI();
    }

    flipFocusCard() {
        const focusCard = document.querySelector('#focusModeContainer .flashcard');
        if (!focusCard) return;

        focusCard.classList.toggle('is-flipped');
        
        // Show/hide confidence buttons
        const confidenceButtons = focusCard.querySelector('.confidence-buttons');
        if (confidenceButtons) {
            confidenceButtons.style.display = focusCard.classList.contains('is-flipped') ? 'flex' : 'none';
        }
    }

    previousFocusCard() {
        if (this.deckManager.previousCard()) {
            this.updateFocusCard();
            this.updateCardNavigation();
        }
    }

    nextFocusCard() {
        if (this.deckManager.nextCard()) {
            this.updateFocusCard();
            this.updateCardNavigation();
        }
    }

    updateFocusCard() {
        const card = this.deckManager.getCurrentCard();
        const focusCard = document.querySelector('#focusModeContainer .flashcard');
        if (!card || !focusCard) return;

        const questionText = focusCard.querySelector('.card-front .card-main');
        const answerText = focusCard.querySelector('.card-back .card-main');
        questionText.textContent = card.question;
        answerText.textContent = card.answer;

        // Reset to front side
        focusCard.classList.remove('is-flipped');
        
        // Hide confidence buttons
        const confidenceButtons = focusCard.querySelector('.confidence-buttons');
        if (confidenceButtons) {
            confidenceButtons.style.display = 'none';
        }

        // Update card count
        const deck = this.deckManager.getCurrentDeck();
        document.getElementById('focusCardCount').textContent = 
            `${this.deckManager.currentCardIndex + 1}/${deck.cards.length}`;
    }

    flipCard() {
        const flashcard = document.getElementById('flashcard');
        flashcard.classList.toggle('is-flipped');

        // Show confidence buttons only when card is flipped to answer side
        const confidenceButtons = document.getElementById('confidenceButtons');
        if (confidenceButtons) {
            confidenceButtons.style.display = flashcard.classList.contains('is-flipped') ? 'flex' : 'none';
        }
    }

    handleSwipe() {
        const SWIPE_THRESHOLD = 50;
        const diff = touchEndX - touchStartX;

        if (Math.abs(diff) < SWIPE_THRESHOLD) return;

        if (diff > 0) {
            this.previousCard();
        } else {
            this.nextCard();
        }
    }

    handleConfidence(level) {
        this.deckManager.updateCardMastery(level);
        
        // Add animation class
        const flashcard = document.getElementById('flashcard');
        flashcard.classList.add('flashcard-exit-active');

        // Wait for animation and then show next card
        setTimeout(() => {
            this.nextCard();
            flashcard.classList.remove('flashcard-exit-active');
            flashcard.classList.add('flashcard-enter-active');
            
            // Remove enter animation class
            setTimeout(() => {
                flashcard.classList.remove('flashcard-enter-active');
            }, 300);
        }, 300);
    }

    showDeckModal() {
        const modal = document.getElementById('deckModal');
        const cardsList = document.getElementById('cardsList');
        cardsList.innerHTML = '';
        this.addCardInputs(); // Add first card input
        modal.style.display = 'block';
    }

    addCardInputs() {
        const cardsList = document.getElementById('cardsList');
        const cardInputGroup = document.createElement('div');
        cardInputGroup.className = 'card-input-group';
        cardInputGroup.innerHTML = `
            <input type="text" placeholder="Question" required>
            <input type="text" placeholder="Answer" required>
            <button type="button" class="btn" onclick="this.parentElement.remove()">
                <i class="fas fa-trash"></i>
            </button>
        `;
        cardsList.appendChild(cardInputGroup);
    }

    handleDeckSubmit(e) {
        e.preventDefault();
        const deckName = document.getElementById('deckName').value;
        const cardInputs = document.querySelectorAll('.card-input-group');
        const cards = Array.from(cardInputs).map(group => {
            const [question, answer] = group.querySelectorAll('input');
            return { question: question.value, answer: answer.value };
        });

        this.deckManager.createDeck(deckName, cards);
        this.renderDecks();
        document.getElementById('deckModal').style.display = 'none';
        e.target.reset();
    }

    renderDecks() {
        const deckGrid = document.getElementById('deckGrid');
        deckGrid.innerHTML = '';

        this.deckManager.decks.forEach((deck, index) => {
            const deckCard = document.createElement('div');
            deckCard.className = 'deck-card';
            deckCard.innerHTML = `
                <h3>${deck.name}</h3>
                <p>${deck.cards.length} cards</p>
                <p>Mastery: ${Math.round(deck.mastery * 100)}%</p>
                <div class="deck-card-footer">
                    <span class="last-studied">
                        ${deck.lastStudied ? 'Last studied: ' + new Date(deck.lastStudied).toLocaleDateString() : 'Not studied yet'}
                    </span>
                </div>
            `;
            deckCard.addEventListener('click', () => this.selectDeck(index));
            deckGrid.appendChild(deckCard);
        });

        // Clear any existing search
        const searchInput = document.getElementById('searchDecks');
        if (searchInput.value) {
            this.searchDecks(searchInput.value);
        }
    }

    selectDeck(index) {
        const deck = this.deckManager.setCurrentDeck(index);
        document.getElementById('currentDeckName').textContent = deck.name;
        document.getElementById('cardCount').textContent = `1/${deck.cards.length} Cards`;
        document.getElementById('masteryLevel').textContent = `Mastery: ${deck.mastery}%`;
        this.updateCardNavigation();
        this.showCurrentCard();
    }

    showCurrentCard() {
        const card = this.deckManager.getCurrentCard();
        if (card) {
            const questionText = document.getElementById('questionText');
            const answerText = document.getElementById('answerText');
            questionText.textContent = card.question;
            answerText.textContent = card.answer;

            // Reset card to front side
            const flashcard = document.getElementById('flashcard');
            flashcard.classList.remove('is-flipped');
            
            // Hide confidence buttons when showing new card
            const confidenceButtons = document.getElementById('confidenceButtons');
            if (confidenceButtons) {
                confidenceButtons.style.display = 'none';
            }

            // Add entrance animation
            flashcard.classList.add('flashcard-enter-active');
            setTimeout(() => {
                flashcard.classList.remove('flashcard-enter-active');
            }, 300);
        }
    }

    nextCard() {
        if (this.deckManager.nextCard()) {
            this.showCurrentCard();
            this.updateCardNavigation();
            const deck = this.deckManager.getCurrentDeck();
            document.getElementById('cardCount').textContent = 
                `${this.deckManager.currentCardIndex + 1}/${deck.cards.length} Cards`;
        }
    }

    previousCard() {
        if (this.deckManager.previousCard()) {
            this.showCurrentCard();
            this.updateCardNavigation();
            const deck = this.deckManager.getCurrentDeck();
            document.getElementById('cardCount').textContent = 
                `${this.deckManager.currentCardIndex + 1}/${deck.cards.length} Cards`;
        }
    }

    updateCardNavigation() {
        const deck = this.deckManager.getCurrentDeck();
        const prevBtn = document.getElementById('prevCard');
        const nextBtn = document.getElementById('nextCard');
        
        if (deck) {
            prevBtn.disabled = this.deckManager.currentCardIndex === 0;
            nextBtn.disabled = this.deckManager.currentCardIndex === deck.cards.length - 1;
        } else {
            prevBtn.disabled = nextBtn.disabled = true;
        }
    }

    updateFocusModeUI() {
        const deck = this.deckManager.getCurrentDeck();
        if (!deck) return;

        // Update timer based on remaining cards
        const studyTime = this.deckManager.calculateStudyTime(deck);
        this.timer.setDuration(studyTime);
        
        // Update stats
        document.getElementById('focusCardCount').textContent = 
            `${this.deckManager.currentCardIndex + 1}/${deck.cards.length}`;
        document.getElementById('focusMastery').textContent = 
            `${Math.round(deck.mastery * 100)}%`;
    }

    updateMasteryIndicators() {
        const card = this.deckManager.getCurrentCard();
        const masteryProgress = document.getElementById('masteryProgress');
        const masteryPercentage = document.getElementById('masteryPercentage');
        const studyRecommendation = document.getElementById('studyRecommendation');

        if (card) {
            const mastery = card.mastery || 0;
            masteryProgress.style.width = `${mastery * 100}%`;
            masteryPercentage.textContent = `${Math.round(mastery * 100)}%`;
            studyRecommendation.textContent = this.deckManager.getStudyRecommendation(card);
        }
    }

    updateStudyStats() {
        document.getElementById('totalStudyTime').textContent = 
            `${Math.round(this.deckManager.stats.totalStudyTime / 3600)} hours`;
        document.getElementById('cardsMastered').textContent = 
            this.deckManager.stats.cardsMastered;
        document.getElementById('longestStreak').textContent = 
            `${this.deckManager.stats.longestStreak} days`;
        document.getElementById('achievementPoints').textContent = 
            this.deckManager.stats.achievements.reduce((sum, a) => sum + (a.earned ? a.points : 0), 0);
        
        this.updateStudyChart();
    }

    updateStudyChart() {
        const ctx = document.getElementById('studyChart').getContext('2d');
        const last7Days = [...Array(7)].map((_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - i);
            return date.toISOString().split('T')[0];
        }).reverse();

        const studyData = last7Days.map(date => {
            const sessions = this.deckManager.stats.studyHistory.filter(session => 
                session.date.split('T')[0] === date
            );
            return sessions.reduce((sum, session) => sum + session.duration, 0) / 60; // Convert to minutes
        });

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: last7Days.map(date => new Date(date).toLocaleDateString()),
                datasets: [{
                    label: 'Study Time (minutes)',
                    data: studyData,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Minutes'
                        }
                    }
                }
            }
        });
    }

    searchDecks(query) {
        const deckGrid = document.getElementById('deckGrid');
        const searchTerm = query.toLowerCase();

        this.deckManager.decks.forEach((deck, index) => {
            const deckCard = deckGrid.children[index];
            if (!deckCard) return;

            const matchesDeckName = deck.name.toLowerCase().includes(searchTerm);
            const matchesCards = deck.cards.some(card => 
                card.question.toLowerCase().includes(searchTerm) || 
                card.answer.toLowerCase().includes(searchTerm)
            );

            if (matchesDeckName || matchesCards) {
                deckCard.style.display = '';
                if (matchesCards && !matchesDeckName) {
                    // Highlight that cards match the search
                    const matchCount = deck.cards.filter(card =>
                        card.question.toLowerCase().includes(searchTerm) ||
                        card.answer.toLowerCase().includes(searchTerm)
                    ).length;
                    deckCard.querySelector('p').textContent = 
                        `${matchCount} matching cards`;
                }
            } else {
                deckCard.style.display = 'none';
            }
        });
    }
}

// Achievement class
/**
 * Your friendly achievement tracker! 🏆
 * 
 * Keeps track of:
 * - Study streaks
 * - Cards mastered
 * - Time studied
 * - Special achievements
 */
class Achievement {
    static ACHIEVEMENTS = {
        FIRST_DECK: { id: 'first_deck', name: 'Deck Creator', description: 'Create your first deck', points: 10 },
        STUDY_STREAK: { id: 'study_streak', name: 'Consistent Learner', description: 'Study for 7 days in a row', points: 50 },
        MASTERY_LEVEL: { id: 'mastery_level', name: 'Master Mind', description: 'Achieve 100% mastery in a deck', points: 100 },
        STUDY_SESSION: { id: 'study_session', name: 'Study Session', description: 'Review 10 cards in a session', points: 20 }
    };

    constructor(id, name, description, points) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.points = points;
        this.earned = false;
        this.earnedDate = null;
    }
}

// Statistics class
/**
 * Your friendly statistics tracker! 📊
 * 
 * Keeps track of:
 * - Total study time
 * - Cards mastered
 * - Longest study streak
 * - Study history
 * - Achievements
 */
class Statistics {
    constructor() {
        this.totalStudyTime = 0;
        this.cardsMastered = 0;
        this.currentStreak = 0;
        this.longestStreak = 0;
        this.lastStudyDate = null;
        this.studyHistory = [];
        this.achievements = Object.values(Achievement.ACHIEVEMENTS).map(
            a => new Achievement(a.id, a.name, a.description, a.points)
        );
    }

    updateStreak() {
        const today = new Date().toDateString();
        if (this.lastStudyDate === today) return;

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (this.lastStudyDate === yesterday.toDateString()) {
            this.currentStreak++;
            this.longestStreak = Math.max(this.currentStreak, this.longestStreak);
        } else {
            this.currentStreak = 1;
        }
        
        this.lastStudyDate = today;
        this.checkAchievements();
    }

    addStudySession(duration, cardsReviewed) {
        this.totalStudyTime += duration;
        this.studyHistory.push({
            date: new Date().toISOString(),
            duration,
            cardsReviewed
        });
        this.updateStreak();
    }

    checkAchievements() {
        const unearned = this.achievements.filter(a => !a.earned);
        unearned.forEach(achievement => {
            switch (achievement.id) {
                case 'study_streak':
                    if (this.currentStreak >= 7) this.earnAchievement(achievement);
                    break;
                case 'study_session':
                    if (this.studyHistory[this.studyHistory.length - 1].cardsReviewed >= 10) this.earnAchievement(achievement);
                    break;
                // Add more achievement checks here
            }
        });
    }

    earnAchievement(achievement) {
        if (!achievement.earned) {
            achievement.earned = true;
            achievement.earnedDate = new Date();
            this.showAchievementNotification(achievement);
        }
    }

    showAchievementNotification(achievement) {
        // Create and show a notification
        const notification = document.createElement('div');
        notification.className = 'achievement-notification';
        notification.innerHTML = `
            <i class="fas fa-trophy"></i>
            <div>
                <h3>${achievement.name}</h3>
                <p>${achievement.description}</p>
                <p>+${achievement.points} points</p>
            </div>
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    const uiController = new UIController();
    uiController.updateStudyStats();
});
