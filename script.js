// 1. Initialize Supabase
const SUPABASE_URL = 'https://ughtecmviwklhjfvdqub.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnaHRlY212aXdrbGhqZnZkcXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MzQzMzIsImV4cCI6MjA5MjMxMDMzMn0.F0fbrIcB8yiVAyhzz3hjKLNB1ZtL5rNqU07S_eZiG4Q';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State variables for Participants
let participants = [];
let activeSquad = "All";

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
            .select('role, contact_no')
            .ilike('role', 'admin');

        if (error) throw error;

        if (profiles && profiles.length > 0) {
            container.innerHTML = profiles.map(admin => `
                <div class="flex justify-between items-center py-3 border-b border-[#9c3f00]/10 last:border-0">
                    <div class="flex flex-col">
                        <span class="text-[10px] font-black text-[#9c3f00]/60 uppercase tracking-widest">Coordinator</span>
                        <span class="font-bold text-xl uppercase tracking-tighter text-[#4a2506]">${admin.role}</span>
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
    const { data: games, error } = await supabaseClient
        .from('games')
        .select(`name, status, game_results ( squad_name, rank, points )`);

    if (error) {
        console.error('Fetch Games Error:', error.message);
        return;
    }

    games.forEach(game => {
        const card = document.querySelector(`[data-game="${game.name}"]`);
        if (!card) return;

        const badge = card.querySelector('.status-badge');
        const resultText = card.querySelector('.result-text');
        const list = card.querySelector('.leaderboard-list');
        const container = card.querySelector('.results-container');
        const btn = card.querySelector('.view-results-btn');

        const status = (game.status || 'pending').toLowerCase();
        badge.innerText = status.toUpperCase();

        if (status === 'finished') {
            badge.className = "status-badge bg-green-500 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm";

            const winner = game.game_results?.find(r => r.rank === 1);
            resultText.innerText = winner ? `WINNER: ${winner.squad_name.toUpperCase()}` : "SCORED";

            if (game.game_results && game.game_results.length > 0) {
                btn.classList.remove('hidden');
                const sorted = game.game_results.sort((a, b) => a.rank - b.rank);

                list.innerHTML = sorted.map(res => `
                    <li class="flex justify-between items-center text-[11px] border-b border-[#ffdcc6] py-1.5 last:border-0">
                        <span class="${res.rank === 1 ? 'font-bold text-[#FF6B00]' : 'text-[#9c3f00]/70 font-semibold'}">
                            ${res.rank}. ${res.squad_name}
                        </span>
                        <span class="font-bold text-[#9c3f00]">${res.points} PTS</span>
                    </li>
                `).join('');

                btn.onclick = () => {
                    const isHidden = container.classList.toggle('hidden');
                    btn.innerText = isHidden ? "View Results" : "Hide Results";
                };
            }
        } else if (status === 'active') {
            badge.className = "status-badge bg-[#FF6B00] text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider animate-pulse shadow-sm";
            resultText.innerText = "LIVE NOW";
            btn.classList.add('hidden');
            container.classList.add('hidden');
        } else {
            badge.className = "status-badge bg-gray-200 text-gray-500 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider";
            resultText.innerText = "UPCOMING";
            btn.classList.add('hidden');
            container.classList.add('hidden');
        }
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
        const { data: results, error } = await supabaseClient
            .from('game_results')
            .select('squad_name, points');

        if (error) throw error;

        const totals = results.reduce((acc, row) => {
            const name = row.squad_name;
            acc[name] = (acc[name] || 0) + (row.points || 0);
            return acc;
        }, {});

        const sorted = Object.keys(totals).map(name => ({
            name: name,
            score: totals[name]
        })).sort((a, b) => b.score - a.score);

        updateLeaderboardUI(sorted);
    } catch (err) {
        console.error("Fetch Leaderboard Error:", err.message);
    }
}

function updateLeaderboardUI(squads) {
    // Update Podium
    if (squads[0]) {
        document.getElementById('rank-1-name').innerText = squads[0].name;
        document.getElementById('rank-1-score').innerText = squads[0].score.toLocaleString();
    }
    if (squads[1]) {
        document.getElementById('rank-2-name').innerText = squads[1].name;
        document.getElementById('rank-2-score').innerText = squads[1].score.toLocaleString();
    }
    if (squads[2]) {
        document.getElementById('rank-3-name').innerText = squads[2].name;
        document.getElementById('rank-3-score').innerText = squads[2].score.toLocaleString();
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
            <span class="kinetic-headline text-2xl text-[#FF6B00] bg-[#fff4ef] px-4 py-1 rounded-full border border-[#ffe3d2]">${s.score.toLocaleString()}</span>
        </div>
    `).join('');
}
