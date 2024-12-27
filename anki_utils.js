class AnkiConverter {
    static exportToAnki(decks) {
        // Anki format: #separator:tab
        // #html:true
        // #columns:Front\tBack\tDeck\tTags
        let output = '#separator:tab\n#html:true\n#columns:Front\tBack\tDeck\tTags\n\n';
        
        decks.forEach(deck => {
            deck.cards.forEach(card => {
                // Escape tab characters and newlines
                const front = card.question.replace(/\\t/g, ' ').replace(/\\n/g, '<br>');
                const back = card.answer.replace(/\\t/g, ' ').replace(/\\n/g, '<br>');
                output += `${front}\t${back}\t${deck.name}\t\n`;
            });
        });

        // Create and trigger download
        const blob = new Blob([output], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'studymaster_export.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    static importFromAnki(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const lines = text.split('\n');
                    
                    // Skip header lines
                    let startIndex = 0;
                    while (startIndex < lines.length && 
                           (lines[startIndex].startsWith('#') || lines[startIndex].trim() === '')) {
                        startIndex++;
                    }

                    // Process cards
                    const deckMap = new Map(); // Group cards by deck
                    
                    for (let i = startIndex; i < lines.length; i++) {
                        const line = lines[i].trim();
                        if (!line) continue;

                        const [front, back, deckName] = line.split('\t').map(s => s.trim());
                        if (!front || !back) continue;

                        const deck = deckName || 'Imported Cards';
                        if (!deckMap.has(deck)) {
                            deckMap.set(deck, []);
                        }

                        // Convert Anki HTML to plain text if needed
                        const cleanFront = front.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
                        const cleanBack = back.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');

                        deckMap.get(deck).push({
                            question: cleanFront,
                            answer: cleanBack
                        });
                    }

                    // Convert map to array of decks
                    const decks = [];
                    deckMap.forEach((cards, name) => {
                        decks.push({
                            name,
                            cards,
                            category: 'imported',
                            createdAt: new Date().toISOString()
                        });
                    });

                    resolve(decks);
                } catch (error) {
                    reject(new Error('Invalid Anki file format: ' + error.message));
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }
}
