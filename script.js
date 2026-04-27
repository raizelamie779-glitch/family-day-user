// 1. Initialize Supabase
const SUPABASE_URL = 'https://ughtecmviwklhjfvdqub.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnaHRlY212aXdrbGhqZnZkcXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MzQzMzIsImV4cCI6MjA5MjMxMDMzMn0.F0fbrIcB8yiVAyhzz3hjKLNB1ZtL5rNqU07S_eZiG4Q';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State variables for Participants
let participants = [];
let activeSquad = "All";

// State variables for Games
let allGames = [];
let activeGameCategory = 'all';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Navigation
    initNavigation();

    // Fetch initial data for all sections
    fetchAdminPhone();
    fetchGamesFromDB();
    fetchParticipants();
    fetchLeaderboard();

    // Setup Real-time Listeners
    setupRealtimeSubscriptions();

    // Setup Event Listeners for Participants filtering
    document.getElementById('search-input').addEventListener('input', renderParticipants);
    document.querySelectorAll('.cat-checkbox').forEach(cb => {
        cb.addEventListener('change', renderParticipants);
    });
    document.querySelectorAll('.squad-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.squad-btn').forEach(b => b.classList.remove('active-filter'));
            btn.classList.add('active-filter');
            activeSquad = btn.dataset.squad;
            renderParticipants();
        });
    });

    // Setup Event Listeners for Games category filter
    document.querySelectorAll('.game-cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.game-cat-btn').forEach(b => b.classList.remove('active-filter'));
            btn.classList.add('active-filter');
            activeGameCategory = btn.dataset.cat;
            renderGames();
        });
    });
});

function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    const pageTitle = document.getElementById('page-title');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons and tabs
            navButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(t => t.classList.remove('active'));

            // Add active class to clicked button and corresponding tab
            btn.classList.add('active');
            const targetTab = document.getElementById(btn.dataset.tab);
            targetTab.classList.add('active');
            pageTitle.innerText = btn.dataset.title;
            
            // Scroll to top when switching tabs
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}

function setupRealtimeSubscriptions() {
    supabaseClient
        .channel('public_app_updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchAdminPhone)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, fetchGamesFromDB)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_results' }, () => {
            fetchGamesFromDB();
            fetchLeaderboard();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bonus_scores' }, fetchLeaderboard)
        // NOTE: If you add real-time for participants, you can add it here.
        .subscribe();
}

// ==========================================
// GENERAL INFO LOGIC
// ==========================================
async function fetchAdminPhone() {
    const container = document.getElementById('contact-list');
    try {
        const { data: profiles, error } = await supabaseClient
            .from('profiles')
            .select('role, contact_no, sys_role, name')
            .ilike('role', 'admin');

        if (error) throw error;

        if (profiles && profiles.length > 0) {
            container.innerHTML = profiles.map(admin => `
                <div class="flex justify-between items-center py-3 border-b border-[#9c3f00]/10 last:border-0">
                    <div class="flex flex-col">
                        <span class="text-[10px] font-black text-[#9c3f00]/60 uppercase tracking-widest">Coordinator</span>
                        <span class="font-bold text-lg tracking-tighter text-[#4a2506]">${admin.name || admin.email || 'Unknown'}</span>
                        <span class="text-[11px] font-semibold text-[#9c3f00]/70 uppercase tracking-wider">${admin.sys_role || admin.role}</span>
                    </div>
                    <a href="tel:+60${admin.contact_no}" 
                       class="bg-[#FF6B00] text-white px-5 py-2 rounded-full font-black text-lg tracking-tighter hover:bg-[#e05e00] transition-colors shadow-md flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm">call</span>
                        +60 ${admin.contact_no}
                    </a>
                </div>
            `).join('');
        } else {
            container.innerHTML = `<p class="text-sm opacity-50 italic">No official contact found.</p>`;
        }
    } catch (err) {
        console.error('Fetch Admin Phone Error:', err.message);
        container.innerHTML = `<p class="text-xs text-red-500">Could not load contacts.</p>`;
    }
}

// ==========================================
// GAMES LOGIC
// ==========================================
async function fetchGamesFromDB() {
    const gamesContainer = document.getElementById('games-container');
    if (!gamesContainer) return;

    const { data: games, error } = await supabaseClient
        .from('games')
        .select(`id, name, location, status, category, game_results ( squad_name, rank, points )`)
        .order('id', { ascending: true });

    if (error) {
        console.error('Fetch Games Error:', error.message);
        gamesContainer.innerHTML = '<div class="text-center text-red-500 py-10 col-span-full">Failed to load games.</div>';
        return;
    }

    allGames = games || [];
    renderGames();
}

function renderGames() {
    const gamesContainer = document.getElementById('games-container');
    if (!gamesContainer) return;

    const filtered = activeGameCategory === 'all'
        ? allGames
        : allGames.filter(g => (g.category || '').toLowerCase() === activeGameCategory);

    if (filtered.length === 0) {
        gamesContainer.innerHTML = '<div class="text-center opacity-50 py-10 col-span-full font-bold">No games in this category.</div>';
        return;
    }

    gamesContainer.innerHTML = filtered.map((game, index) => {
        const status = (game.status || 'pending').toLowerCase();
        let badgeClass = "bg-gray-200 text-gray-500";
        let badgeText = status.toUpperCase();
        let resultText = "UPCOMING";
        let isFinished = status === 'finished';
        let showResultsBtn = false;
        let listHTML = "";

        if (status === 'finished') {
            badgeClass = "bg-green-500 text-white shadow-sm";
            const winner = game.game_results?.find(r => r.rank === 1);
            resultText = winner ? `WINNER: ${winner.squad_name.toUpperCase()}` : "SCORED";

            if (game.game_results && game.game_results.length > 0) {
                showResultsBtn = true;
                const sorted = game.game_results.sort((a, b) => a.rank - b.rank);
                listHTML = sorted.map(res => `
                    <li class="flex justify-between items-center text-[11px] border-b border-[#ffdcc6] py-1.5 last:border-0">
                        <span class="${res.rank === 1 ? 'font-bold text-[#FF6B00]' : 'text-[#9c3f00]/70 font-semibold'}">
                            ${res.rank}. ${res.squad_name}
                        </span>
                        <span class="font-bold text-[#9c3f00]">${res.points} PTS</span>
                    </li>
                `).join('');
            }
        } else if (status === 'active') {
            badgeClass = "bg-[#FF6B00] text-white animate-pulse shadow-sm";
            resultText = "LIVE NOW";
        }

        const categoryLabel = game.category ? game.category.toUpperCase() : '';

        return `
        <div data-game="${game.name}" class="bg-white border border-[#ffdcc6] rounded-2xl p-6 flex flex-col justify-between min-h-[220px] shadow-sm">
          <div>
            <div class="flex justify-between items-start mb-4">
              <span class="status-badge px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${badgeClass}">${badgeText}</span>
              <span class="material-symbols-outlined text-[#FF6B00] text-3xl">sports_esports</span>
            </div>
            <h4 class="kinetic-headline text-2xl text-[#9c3f00]">${game.name}</h4>
            <p class="text-xs opacity-60 font-bold uppercase mt-1">${game.location || 'TBA'}</p>
            ${categoryLabel ? `<span class="inline-block mt-2 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-[#ffede4] text-[#9c3f00] rounded-full border border-[#ffdcc6]">${categoryLabel}</span>` : ''}
          </div>

          <div class="results-container hidden mt-4 pt-4 border-t border-[#ffdcc6]">
            <h5 class="text-[10px] font-bold uppercase mb-3 text-[#9c3f00] opacity-60 tracking-wider">Final Standings</h5>
            <ul class="leaderboard-list space-y-2">
                ${listHTML}
            </ul>
          </div>

          <div class="flex justify-between items-center mt-6">
            <span class="result-text font-black text-sm text-[#9c3f00]">${resultText}</span>
            <button class="view-results-btn ${showResultsBtn ? '' : 'hidden'} text-[10px] font-bold bg-[#ffede4] text-[#9c3f00] px-3 py-1.5 rounded-full uppercase tracking-tighter hover:bg-[#ffdcc6] transition-colors">
              View Results
            </button>
          </div>
        </div>
        `;
    }).join('');

    // Attach event listeners for View Results buttons
    gamesContainer.querySelectorAll('.view-results-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('[data-game]');
            const container = card.querySelector('.results-container');
            const isHidden = container.classList.toggle('hidden');
            e.target.innerText = isHidden ? "View Results" : "Hide Results";
        });
    });
}

// ==========================================
// PARTICIPANTS LOGIC
// ==========================================
async function fetchParticipants() {
    const { data, error } = await supabaseClient
        .from('participants')
        .select('*')
        .order('name', { ascending: true });

    if (error) return console.error("Fetch Participants Error:", error);
    participants = data;
    renderParticipants();
}

function renderParticipants() {
    const container = document.getElementById('master-list');
    if(!container) return; // if not on DOM yet

    const search = document.getElementById('search-input').value.toLowerCase();
    const activeCats = Array.from(document.querySelectorAll('.cat-checkbox:checked')).map(cb => cb.value);

    const filtered = participants.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search);
        const dbSquad = (p.squad || "").toLowerCase();
        const selectedSquad = activeSquad.toLowerCase();
        const matchesSquad = activeSquad === "All" || dbSquad.includes(selectedSquad.split(' ')[0]);
        const matchesCat = activeCats.includes(p.category);
        return matchesSearch && matchesSquad && matchesCat;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="text-center py-20 opacity-40 font-bold">No family members found.</div>`;
        return;
    }

    const grouped = filtered.reduce((groups, p) => {
        const letter = p.name[0].toUpperCase();
        if (!groups[letter]) groups[letter] = [];
        groups[letter].push(p);
        return groups;
    }, {});

    container.innerHTML = Object.keys(grouped).sort().map(letter => `
        <div class="mb-8">
            <h3 class="kinetic-headline text-4xl text-[#FF6B00] opacity-20 mb-4 ml-2">${letter}</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${grouped[letter].map(p => `
                    <div class="bg-white p-5 rounded-2xl flex justify-between items-center shadow-sm border border-[#ffdcc6] hover:shadow-md transition-shadow">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 rounded-full bg-[#ffede4] flex items-center justify-center text-[#9c3f00] font-black italic text-xl shrink-0">
                                ${p.name.charAt(0)}
                            </div>
                            <div>
                                <h4 class="font-bold text-[#4a2506] uppercase text-[15px] leading-tight mb-1">${p.name}</h4>
                                <div class="flex flex-wrap gap-2 items-center">
                                    <span class="text-[9px] font-black px-2 py-0.5 bg-[#ffe3d2] text-[#9c3f00] rounded-full uppercase tracking-wider">${p.squad}</span>
                                    <span class="text-[9px] font-bold text-gray-400 uppercase tracking-widest">${p.category}</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex flex-col items-end gap-1 shrink-0">
                            <span class="material-symbols-outlined text-2xl ${p.is_present ? 'text-green-500' : 'text-gray-300'}">
                                check_circle
                            </span>
                            <span class="text-[9px] font-bold uppercase tracking-wider ${p.is_present ? 'text-green-600' : 'text-gray-400'}">
                                ${p.is_present ? 'Confirmed' : 'Pending'}
                            </span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// ==========================================
// LEADERBOARD LOGIC
// ==========================================
async function fetchLeaderboard() {
    try {
        const [gamesRes, bonusRes] = await Promise.all([
            supabaseClient.from('game_results').select('squad_name, points'),
            supabaseClient.from('bonus_scores').select('squad_name, points')
        ]);

        if (gamesRes.error) throw gamesRes.error;
        if (bonusRes.error) throw bonusRes.error;

        const totals = {};

        const getSquad = (rawName) => {
            const key = rawName.replace(/\s+/g, '').toLowerCase();
            if (!totals[key]) {
                totals[key] = { name: rawName.trim(), games_score: 0, bonus_score: 0, score: 0 };
            } else if (rawName.includes(' ') && !totals[key].name.includes(' ')) {
                totals[key].name = rawName.trim();
            }
            return totals[key];
        };

        (gamesRes.data || []).forEach(row => {
            if (!row.squad_name) return;
            getSquad(row.squad_name).games_score += (row.points || 0);
        });

        (bonusRes.data || []).forEach(row => {
            if (!row.squad_name) return;
            row.squad_name.split(',').forEach(sName => {
                if (!sName.trim()) return;
                getSquad(sName).bonus_score += (row.points || 0);
            });
        });

        const sorted = Object.values(totals).map(s => {
            s.score = s.games_score + s.bonus_score;
            return s;
        }).sort((a, b) => b.score - a.score);

        updateLeaderboardUI(sorted);
    } catch (err) {
        console.error("Fetch Leaderboard Error:", err.message);
    }
}

function updateLeaderboardUI(squads) {
    // Update Podium
    if (squads[0]) {
        document.getElementById('rank-1-name').innerText = squads[0].name;
        document.getElementById('rank-1-score').innerHTML = `${squads[0].score.toLocaleString()}<div class="text-[9px] md:text-xs opacity-80 mt-1 font-sans font-medium tracking-wide normal-case">Games: ${squads[0].games_score} | Bonus: ${squads[0].bonus_score}</div>`;
    }
    if (squads[1]) {
        document.getElementById('rank-2-name').innerText = squads[1].name;
        document.getElementById('rank-2-score').innerHTML = `${squads[1].score.toLocaleString()}<div class="text-[8px] md:text-[10px] opacity-80 mt-1 font-sans font-medium tracking-wide normal-case">Games: ${squads[1].games_score} | Bonus: ${squads[1].bonus_score}</div>`;
    }
    if (squads[2]) {
        document.getElementById('rank-3-name').innerText = squads[2].name;
        document.getElementById('rank-3-score').innerHTML = `${squads[2].score.toLocaleString()}<div class="text-[8px] md:text-[10px] opacity-80 mt-1 font-sans font-medium tracking-wide normal-case">Games: ${squads[2].games_score} | Bonus: ${squads[2].bonus_score}</div>`;
    }

    // Update List
    const list = document.getElementById('standings-list');
    const remaining = squads.slice(3);

    if (remaining.length === 0 && squads.length <= 3 && squads.length > 0) {
        list.innerHTML = `<div class="text-center opacity-40 font-bold py-6 text-sm">No other teams to display.</div>`;
        return;
    } else if (squads.length === 0) {
         list.innerHTML = `<div class="text-center opacity-40 font-bold py-6 text-sm">Waiting for results...</div>`;
         return;
    }

    list.innerHTML = remaining.map((s, i) => `
        <div class="bg-white p-5 rounded-2xl flex justify-between items-center shadow-sm border border-[#ffdcc6] hover:shadow-md transition-shadow relative overflow-hidden">
            <div class="absolute left-0 top-0 bottom-0 w-2 bg-[#FF6B00]"></div>
            <div class="flex items-center gap-4 pl-4">
                <span class="kinetic-headline text-3xl opacity-20 text-[#9c3f00]">${(i + 4).toString().padStart(2, '0')}</span>
                <span class="font-bold text-[16px] text-[#4a2506] uppercase tracking-wide">${s.name}</span>
            </div>
            <div class="flex flex-col items-end">
                <span class="kinetic-headline text-2xl text-[#FF6B00] bg-[#fff4ef] px-4 py-1 rounded-full border border-[#ffe3d2] leading-none">${s.score.toLocaleString()}</span>
                <div class="text-[9px] font-bold opacity-50 mt-1.5 tracking-wider uppercase font-sans">Games: ${s.games_score} | Bonus: ${s.bonus_score}</div>
            </div>
        </div>
    `).join('');
}
