// BEATDROP Interactive Music Card Game — Client Application
(function () {
  'use strict';

  // --- Application State ---
  const state = {
    mode: 'quickfire', // 'quickfire' | 'party' (Timeline) | 'lookup'
    gamesets: [],
    customPlaylists: [],
    onlyNewTracksFilter: false,
    lastSyncedSku: null,
    currentSku: localStorage.getItem('beatdrop_sku') || 'aaaa0005', // Default: Original (United Kingdom)
    currentEditionName: 'Original (United Kingdom)',
    allCards: [],
    drawPile: [],
    activeCard: null, // { CardNumber, Spotify, ArtistType, metadata }
    isRevealed: false,
    isPlaying: false,
    selectedSlotIndex: null,
    cardsToWin: 10,
    players: [],
    activePlayerIndex: 0,
    tokenAwardedThisTurn: false,
    quickfirePointAwardedTo: null, // index of player awarded this round
    spotifyToken: localStorage.getItem('beatdrop_spotify_token') || '',
    spotifyClientId: localStorage.getItem('beatdrop_spotify_client_id') || '',
    spotifyDeviceId: null,
    sdkPlayer: null
  };

  // HTML5 Audio Element for instant 30s Spotify previews
  const audioEl = new Audio();
  audioEl.crossOrigin = 'anonymous';
  audioEl.preload = 'auto';

  // --- DOM Elements ---
  const els = {
    currentEditionBadge: document.getElementById('currentEditionBadge'),
    editionBtnLabel: document.getElementById('editionBtnLabel'),
    modeQuickfireBtn: document.getElementById('modeQuickfireBtn'),
    modePartyBtn: document.getElementById('modePartyBtn'),
    modeLookupBtn: document.getElementById('modeLookupBtn'),
    customPlaylistBtn: document.getElementById('customPlaylistBtn'),
    editionSelectBtn: document.getElementById('editionSelectBtn'),
    spotifyConnectBtn: document.getElementById('spotifyConnectBtn'),
    spotifyStatusText: document.getElementById('spotifyStatusText'),

    playersStrip: document.getElementById('playersStrip'),
    playersList: document.getElementById('playersList'),
    deckCountLabel: document.getElementById('deckCountLabel'),
    newGameBtn: document.getElementById('newGameBtn'),

    lookupBar: document.getElementById('lookupBar'),
    cardNumberInput: document.getElementById('cardNumberInput'),
    loadCardNumBtn: document.getElementById('loadCardNumBtn'),
    randomLookupBtn: document.getElementById('randomLookupBtn'),
    lookupEditionName: document.getElementById('lookupEditionName'),

    deckArea: document.getElementById('deckArea'),
    drawDeckStack: document.getElementById('drawDeckStack'),
    deckCtaText: document.getElementById('deckCtaText'),
    emptyStagePrompt: document.getElementById('emptyStagePrompt'),
    emptyStageTitle: document.getElementById('emptyStageTitle'),
    emptyStageDesc: document.getElementById('emptyStageDesc'),
    drawFirstCardBtn: document.getElementById('drawFirstCardBtn'),

    cardScene: document.getElementById('cardScene'),
    card3d: document.getElementById('card3d'),
    cardFront: document.getElementById('cardFront'),
    cardBack: document.getElementById('cardBack'),
    cardGlareFront: document.getElementById('cardGlareFront'),
    cardGlareBack: document.getElementById('cardGlareBack'),

    cardEditionTag: document.getElementById('cardEditionTag'),
    cardNumberBadge: document.getElementById('cardNumberBadge'),
    vinylDisc: document.getElementById('vinylDisc'),
    vinylCardNum: document.getElementById('vinylCardNum'),
    tonearm: document.getElementById('tonearm'),
    audioVisualizer: document.getElementById('audioVisualizer'),
    playPauseBtn: document.getElementById('playPauseBtn'),
    iconPlay: document.getElementById('iconPlay'),
    iconPause: document.getElementById('iconPause'),
    playbackStatusLabel: document.getElementById('playbackStatusLabel'),
    playbackTimer: document.getElementById('playbackTimer'),
    progressBarBg: document.getElementById('progressBarBg'),
    progressBarFill: document.getElementById('progressBarFill'),
    artistTypePill: document.getElementById('artistTypePill'),

    cardBackBg: document.getElementById('cardBackBg'),
    cardBackEditionTag: document.getElementById('cardBackEditionTag'),
    cardBackNumberBadge: document.getElementById('cardBackNumberBadge'),
    revealCoverImg: document.getElementById('revealCoverImg'),
    revealYear: document.getElementById('revealYear'),
    revealArtist: document.getElementById('revealArtist'),
    revealTitle: document.getElementById('revealTitle'),
    backPlayPauseBtn: document.getElementById('backPlayPauseBtn'),
    backPlayBtnText: document.getElementById('backPlayBtnText'),
    openSpotifyLink: document.getElementById('openSpotifyLink'),

    stageControls: document.getElementById('stageControls'),
    guessBox: document.getElementById('guessBox'),
    guessInputsContainer: document.getElementById('guessInputsContainer'),
    guessArtistInput: document.getElementById('guessArtistInput'),
    guessYearInput: document.getElementById('guessYearInput'),
    timelinePromptText: document.getElementById('timelinePromptText'),
    revealCardBtn: document.getElementById('revealCardBtn'),
    revealBtnText: document.getElementById('revealBtnText'),
    flipBackBtn: document.getElementById('flipBackBtn'),

    // Quickfire Judge & Player Assignment Elements
    quickfireJudgePanel: document.getElementById('quickfireJudgePanel'),
    judgeHeaderLabel: document.getElementById('judgeHeaderLabel'),
    judgeOutcomeButtons: document.getElementById('judgeOutcomeButtons'),
    judgeSuccessBtn: document.getElementById('judgeSuccessBtn'),
    judgeFailBtn: document.getElementById('judgeFailBtn'),
    assignPlayerPanel: document.getElementById('assignPlayerPanel'),
    assignPlayersGrid: document.getElementById('assignPlayersGrid'),
    quickfireResultBar: document.getElementById('quickfireResultBar'),
    quickfireResultMsg: document.getElementById('quickfireResultMsg'),
    quickfireNextCardBtn: document.getElementById('quickfireNextCardBtn'),

    // Timeline & Lookup Verdict Elements
    verdictPanel: document.getElementById('verdictPanel'),
    verdictBanner: document.getElementById('verdictBanner'),
    verdictIcon: document.getElementById('verdictIcon'),
    verdictTitle: document.getElementById('verdictTitle'),
    verdictSubtitle: document.getElementById('verdictSubtitle'),
    awardTokenBtn: document.getElementById('awardTokenBtn'),
    nextCardBtn: document.getElementById('nextCardBtn'),

    spotifyEmbedDrawer: document.getElementById('spotifyEmbedDrawer'),
    embedSpoilerShield: document.getElementById('embedSpoilerShield'),
    toggleRawEmbedBtn: document.getElementById('toggleRawEmbedBtn'),
    spotifyIframeContainer: document.getElementById('spotifyIframeContainer'),

    timelineSection: document.getElementById('timelineSection'),
    activePlayerTimelineName: document.getElementById('activePlayerTimelineName'),
    timelineProgressBadge: document.getElementById('timelineProgressBadge'),
    timelineTrack: document.getElementById('timelineTrack'),

    editionModal: document.getElementById('editionModal'),
    closeEditionModalBtn: document.getElementById('closeEditionModalBtn'),
    editionSearchInput: document.getElementById('editionSearchInput'),
    editionsList: document.getElementById('editionsList'),

    setupModal: document.getElementById('setupModal'),
    closeSetupModalBtn: document.getElementById('closeSetupModalBtn'),
    setupPlayersInputs: document.getElementById('setupPlayersInputs'),
    addPlayerInputBtn: document.getElementById('addPlayerInputBtn'),
    cardsToWinSelect: document.getElementById('cardsToWinSelect'),
    startNewGameConfirmBtn: document.getElementById('startNewGameConfirmBtn'),

    spotifyModal: document.getElementById('spotifyModal'),
    closeSpotifyModalBtn: document.getElementById('closeSpotifyModalBtn'),
    spotifyClientIdInput: document.getElementById('spotifyClientIdInput'),
    redirectUriDisplay: document.getElementById('redirectUriDisplay'),
    spotifyOAuthLoginBtn: document.getElementById('spotifyOAuthLoginBtn'),
    spotifyTokenInput: document.getElementById('spotifyTokenInput'),
    clearSpotifyTokenBtn: document.getElementById('clearSpotifyTokenBtn'),
    saveSpotifySettingsBtn: document.getElementById('saveSpotifySettingsBtn'),

    winnerModal: document.getElementById('winnerModal'),
    winnerTitle: document.getElementById('winnerTitle'),
    winnerSubtitle: document.getElementById('winnerSubtitle'),
    playAgainWinnerBtn: document.getElementById('playAgainWinnerBtn'),

    tvRoomCorner: document.getElementById('tvRoomCorner'),
    tvQrImg: document.getElementById('tvQrImg'),
    tvRoomCodeLabel: document.getElementById('tvRoomCodeLabel'),
    tvRoomUrlLabel: document.getElementById('tvRoomUrlLabel'),

    playlistModal: document.getElementById('playlistModal'),
    closePlaylistModalBtn: document.getElementById('closePlaylistModalBtn'),
    playlistUrlInput: document.getElementById('playlistUrlInput'),
    playlistNameInput: document.getElementById('playlistNameInput'),
    syncPlaylistSubmitBtn: document.getElementById('syncPlaylistSubmitBtn'),
    syncReportCard: document.getElementById('syncReportCard'),
    syncReportTitle: document.getElementById('syncReportTitle'),
    playAllCustomBtn: document.getElementById('playAllCustomBtn'),
    playOnlyNewCustomBtn: document.getElementById('playOnlyNewCustomBtn'),
    syncStatsGrid: document.getElementById('syncStatsGrid'),
    syncNewTracksList: document.getElementById('syncNewTracksList'),
    savedPlaylistsList: document.getElementById('savedPlaylistsList')
  };

  // --- Initialization ---
  async function init() {
    els.redirectUriDisplay.textContent = window.location.origin + '/';
    els.spotifyClientIdInput.value = state.spotifyClientId;
    els.spotifyTokenInput.value = state.spotifyToken;

    await handleSpotifyOAuthCallback();
    updateSpotifyPillStatus();
    if (state.spotifyToken) {
      initSpotifyWebPlaybackSDK();
    }

    setupEventListeners();
    setup3DTiltPhysics();

    await loadGamesetsList();
    if (state.gamesets.length > 0) {
      const targetSku = state.gamesets.some(g => g.sku === state.currentSku)
        ? state.currentSku
        : state.gamesets[0].sku;
      await selectGameset(targetSku, false);
      await startNewGameSession(['Player 1', 'Player 2', 'Player 3'], 10);
    } else {
      els.currentEditionBadge.textContent = 'Add a Spotify Playlist to Play';
      els.deckCountLabel.textContent = '0';
    }
    await switchMode('quickfire');

    // If opened at /tv (or ?tv=1 for the Android TV APK), boot into Synced TV Receiver Mode!
    const isTvReceiver = window.location.pathname === '/tv' || new URLSearchParams(window.location.search).get('tv') === '1';
    if (isTvReceiver) {
      await initSyncedTvReceiverMode();
    }
  }

  // --- Fetch Gamesets & Edition Cards ---
  async function loadGamesetsList() {
    try {
      const res = await fetch('/api/gamesets');
      const data = await res.json();
      state.gamesets = data.gamesets || [];
      state.customPlaylists = data.customPlaylists || [];
      renderEditionsModalList('');
      renderSavedCustomPlaylists();
    } catch (err) {
      console.error('Failed to load gamesets:', err);
    }
  }

  async function selectGameset(sku, restartGame = true, onlyNew = false) {
    try {
      const res = await fetch(`/api/gameset/${encodeURIComponent(sku)}`);
      if (!res.ok) throw new Error('Edition not found');
      const data = await res.json();

      state.currentSku = data.sku;
      state.onlyNewTracksFilter = Boolean(onlyNew);
      state.currentEditionName = data.isCustom
        ? `🎵 ${data.name}${onlyNew ? ' (New Tracks Only)' : ''}`
        : `${data.name} (${data.language})`;
      state.allCards = data.cards || [];
      localStorage.setItem('beatdrop_sku', state.currentSku);

      els.currentEditionBadge.textContent = state.currentEditionName;
      els.lookupEditionName.textContent = state.currentEditionName;
      resetDeckPile();

      if (restartGame && (state.mode === 'party' || state.mode === 'quickfire')) {
        const currentNames = state.players.length > 0 ? state.players.map(p => p.name) : ['Player 1', 'Player 2', 'Player 3'];
        await startNewGameSession(currentNames, state.cardsToWin);
      }
    } catch (err) {
      console.error('Error selecting gameset:', err);
    }
  }

  function resetDeckPile() {
    let sourceCards = [...state.allCards];
    if (state.onlyNewTracksFilter) {
      const filteredNew = sourceCards.filter(c => c.isNew);
      if (filteredNew.length > 0) {
        sourceCards = filteredNew;
      }
    }
    for (let i = sourceCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sourceCards[i], sourceCards[j]] = [sourceCards[j], sourceCards[i]];
    }
    state.drawPile = sourceCards;
    updateDeckCounter();
  }

  function updateDeckCounter() {
    els.deckCountLabel.textContent = state.drawPile.length;
  }

  async function fetchCardMetadata(spotifyId) {
    const headers = {};
    if (state.spotifyToken) {
      headers['Authorization'] = `Bearer ${state.spotifyToken}`;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8500);
    try {
      const res = await fetch(`/api/track/${encodeURIComponent(spotifyId)}`, {
        headers,
        signal: controller.signal
      });
      if (!res.ok) {
        throw new Error('Failed to fetch track metadata');
      }
      return await res.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // --- Game Session & Players Setup ---
  async function startNewGameSession(playerNames, cardsToWin) {
    stopAudio();
    state.cardsToWin = cardsToWin || 10;
    state.activePlayerIndex = 0;
    state.activeCard = null;
    state.isRevealed = false;
    state.selectedSlotIndex = null;
    state.quickfirePointAwardedTo = null;

    resetDeckPile();

    const validNames = playerNames.map(n => n.trim()).filter(Boolean);
    if (validNames.length === 0) validNames.push('Player 1');

    state.players = validNames.map((name) => ({
      name,
      score: 0,    // Used in Quickfire Party Mode
      tokens: 2,   // Used in Timeline Mode
      timeline: [] // Used in Timeline Mode
    }));

    els.emptyStagePrompt.classList.remove('hidden');
    els.cardScene.classList.add('hidden');
    els.stageControls.classList.add('hidden');

    if (state.mode === 'party') {
      await ensureTimelineStarterCards();
    }

    updateDeckCounter();
    renderPlayersStrip();
    renderActivePlayerTimeline();

    if (document.body.classList.contains('tv-mode')) {
      requestAnimationFrame(() => {
        els.drawFirstCardBtn.focus({ preventScroll: true });
      });
    }
  }

  async function ensureTimelineStarterCards() {
    for (const player of state.players) {
      if (player.timeline.length === 0) {
        const starterCard = await drawPlayableCardFromPile();
        if (starterCard) {
          player.timeline.push(starterCard);
        }
      }
    }
    updateDeckCounter();
  }

  async function drawPlayableCardFromPile() {
    while (state.drawPile.length > 0) {
      const rawCard = state.drawPile.pop();
      try {
        const meta = await fetchCardMetadata(rawCard.Spotify);
        if (meta && meta.year) {
          return { ...rawCard, metadata: meta };
        }
      } catch (err) {
        console.warn('Skipping unresolvable card:', rawCard.CardNumber, err.message);
      }
    }
    return null;
  }

  function renderPlayersStrip() {
    els.playersList.innerHTML = '';
    const goalLabel = state.cardsToWin < 900 ? `/${state.cardsToWin}` : '';

    state.players.forEach((player, idx) => {
      const chip = document.createElement('div');
      const isHighlighted = state.mode === 'party'
        ? (idx === state.activePlayerIndex)
        : (state.quickfirePointAwardedTo === idx);

      chip.className = `player-chip ${isHighlighted ? 'active' : ''}`;

      if (state.mode === 'quickfire') {
        chip.innerHTML = `
          <span class="player-name">${escapeHtml(player.name)}</span>
          <div class="player-stats">
            <span class="stat-cards">🏆 ${player.score}${goalLabel} pts</span>
            <span class="tally-adjust-btns">
              <button type="button" class="tally-step-btn btn-minus" title="Subtract 1 point">-</button>
              <button type="button" class="tally-step-btn btn-plus" title="Add 1 point">+</button>
            </span>
          </div>
        `;
        chip.querySelector('.btn-minus').addEventListener('click', (e) => {
          e.stopPropagation();
          player.score = Math.max(0, player.score - 1);
          renderPlayersStrip();
        });
        chip.querySelector('.btn-plus').addEventListener('click', (e) => {
          e.stopPropagation();
          player.score += 1;
          renderPlayersStrip();
          checkQuickfireWinner(player);
        });
      } else {
        chip.innerHTML = `
          <span class="player-name">${escapeHtml(player.name)}</span>
          <div class="player-stats">
            <span class="stat-cards">🎴 ${player.timeline.length}${goalLabel}</span>
            <span class="stat-tokens">🪙 ${player.tokens}</span>
          </div>
        `;
        chip.addEventListener('click', () => {
          if (!state.activeCard || state.isRevealed) {
            state.activePlayerIndex = idx;
            renderPlayersStrip();
            renderActivePlayerTimeline();
          }
        });
      }
      els.playersList.appendChild(chip);
    });
  }

  function checkQuickfireWinner(player) {
    if (state.cardsToWin < 900 && player.score >= state.cardsToWin) {
      setTimeout(() => {
        els.winnerTitle.textContent = `${player.name} Wins!`;
        els.winnerSubtitle.textContent = `${player.name} reached ${player.score} points in Quickfire Party Mode!`;
        els.winnerModal.classList.remove('hidden');
        if (document.body.classList.contains('tv-mode')) {
          requestAnimationFrame(() => {
            els.playAgainWinnerBtn.focus({ preventScroll: true });
          });
        }
      }, 650);
    }
  }

  function renderActivePlayerTimeline() {
    if (state.mode !== 'party') return;
    const player = state.players[state.activePlayerIndex];
    if (!player) return;

    els.activePlayerTimelineName.textContent = player.name;
    els.timelineProgressBadge.textContent = `${player.timeline.length} / ${state.cardsToWin < 900 ? state.cardsToWin : '∞'} Cards`;
    els.timelineTrack.innerHTML = '';

    player.timeline.sort((a, b) => (a.metadata?.year || 0) - (b.metadata?.year || 0));

    const canSelectSlot = Boolean(state.activeCard && !state.isRevealed && state.mode === 'party');

    for (let i = 0; i <= player.timeline.length; i++) {
      if (canSelectSlot) {
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.className = `timeline-slot selectable ${state.selectedSlotIndex === i ? 'selected' : ''}`;
        const label = getSlotRangeLabel(player.timeline, i);
        slot.innerHTML = `<span class="slot-plus">+</span><span>${label}</span>`;
        slot.addEventListener('click', () => {
          state.selectedSlotIndex = i;
          renderActivePlayerTimeline();
          els.timelinePromptText.innerHTML = `<strong>Slot locked (${label})!</strong> Press <em>Stop &amp; Flip Card</em> to see if you're right!`;
          if (document.body.classList.contains('tv-mode')) {
            requestAnimationFrame(() => {
              els.revealCardBtn.focus({ preventScroll: true });
            });
          }
        });
        els.timelineTrack.appendChild(slot);
      }

      if (i < player.timeline.length) {
        const item = player.timeline[i];
        const meta = item.metadata || {};
        const cardEl = document.createElement('div');
        cardEl.className = 'timeline-card';
        cardEl.title = `${meta.artist} - ${meta.title} (${meta.year})`;
        cardEl.innerHTML = `
          ${meta.coverUrl ? `<div class="timeline-card-cover" style="background-image:url('${meta.coverUrl}')"></div>` : ''}
          <div class="timeline-card-year">${meta.year || '????'}</div>
          <div class="timeline-card-meta">
            <div class="timeline-card-artist">${escapeHtml(meta.artist || 'Unknown')}</div>
            <div class="timeline-card-title">${escapeHtml(meta.title || '')}</div>
          </div>
        `;
        els.timelineTrack.appendChild(cardEl);
      }
    }
  }

  function getSlotRangeLabel(timeline, slotIdx) {
    if (timeline.length === 0) return 'Place Here';
    if (slotIdx === 0) return `≤ ${timeline[0].metadata.year}`;
    if (slotIdx === timeline.length) return `≥ ${timeline[timeline.length - 1].metadata.year}`;
    const prevY = timeline[slotIdx - 1].metadata.year;
    const nextY = timeline[slotIdx].metadata.year;
    return `${prevY}–${nextY}`;
  }

  // --- Drawing & Presenting a Card on the 3D Stage ---
  async function drawNextMysteryCard() {
    if (state.drawPile.length === 0) {
      resetDeckPile();
    }
    const rawCard = state.drawPile.pop();
    updateDeckCounter();
    if (rawCard) {
      await presentCardOnStage(rawCard);
    }
  }

  async function loadSpecificCardNumber(cardNumInt) {
    const padded = String(cardNumInt).padStart(5, '0');
    const found = state.allCards.find(
      c => c.CardNumber === padded || parseInt(c.CardNumber, 10) === cardNumInt
    );
    if (!found) {
      alert(`Card #${padded} was not found in ${state.currentEditionName}. Try a number between 1 and ${state.allCards.length}.`);
      return;
    }
    await presentCardOnStage(found);
  }

  let currentDrawId = 0;

  async function presentCardOnStage(rawCard, retryDepth = 0) {
    const drawId = ++currentDrawId;
    stopAudio();
    state.isRevealed = false;
    state.tokenAwardedThisTurn = false;
    state.quickfirePointAwardedTo = null;
    state.selectedSlotIndex = null;

    const activePlayer = state.players[state.activePlayerIndex];
    if (state.mode === 'party' && activePlayer) {
      state.selectedSlotIndex = Math.floor(activePlayer.timeline.length / 2);
    }

    els.emptyStagePrompt.classList.add('hidden');
    els.cardScene.classList.remove('hidden');
    els.stageControls.classList.remove('hidden');

    // Trigger physical deal animation
    els.cardScene.classList.remove('dealing');
    void els.cardScene.offsetWidth;
    els.cardScene.classList.add('dealing');

    els.card3d.classList.remove('is-flipped');
    els.verdictPanel.classList.add('hidden');
    els.quickfireJudgePanel.classList.add('hidden');
    els.guessBox.classList.remove('hidden');
    els.revealCardBtn.classList.remove('hidden');
    els.flipBackBtn.classList.add('hidden');

    els.guessArtistInput.value = '';
    els.guessYearInput.value = '';

    if (state.mode === 'quickfire') {
      els.guessInputsContainer.classList.add('hidden');
      els.timelinePromptText.innerHTML = `<span>⚡ <strong>First to guess wins!</strong> Shout out the Artist &amp; Song, then hit <em>Stop &amp; Flip Card</em>!</span>`;
    } else if (state.mode === 'party') {
      els.guessInputsContainer.classList.remove('hidden');
      els.timelinePromptText.innerHTML = `<span>Tap a <strong>+ slot</strong> on your timeline below (or enter a year) then flip!</span>`;
    } else {
      els.guessInputsContainer.classList.remove('hidden');
      els.timelinePromptText.innerHTML = `<span>Listen to the track, guess the Artist, Song &amp; Year, then flip the card!</span>`;
    }

    const shortEdition = state.currentEditionName.split('(')[0].replace('🎵', '').trim();
    els.cardEditionTag.textContent = shortEdition || 'EDITION';
    els.cardBackEditionTag.textContent = shortEdition || 'EDITION';
    els.cardNumberBadge.textContent = `#${rawCard.CardNumber}`;
    els.cardBackNumberBadge.textContent = `#${rawCard.CardNumber}`;
    els.vinylCardNum.textContent = `#${parseInt(rawCard.CardNumber, 10)}`;

    const typeParts = [];
    if (rawCard.ArtistType) typeParts.push(`${rawCard.ArtistType} Artist`);
    if (rawCard.isNew) typeParts.push('✨ NEW TRACK');
    els.artistTypePill.textContent = typeParts.length > 0 ? typeParts.join(' • ') : 'Mystery Track';

    els.playbackStatusLabel.textContent = 'Loading track from Spotify...';
    els.playbackTimer.textContent = '0:00';
    els.progressBarFill.style.width = '0%';

    // Pre-populate card back immediately if custom playlist card already has title/artist
    els.revealYear.textContent = rawCard.year || '????';
    els.revealArtist.textContent = rawCard.artist || 'Loading...';
    els.revealTitle.textContent = rawCard.title || 'Loading...';
    els.revealCoverImg.src = 'https://placehold.co/300x300/1b1435/ff2a85?text=MUSIC';
    els.cardBackBg.style.backgroundImage = 'none';
    els.openSpotifyLink.href = `https://open.spotify.com/track/${encodeURIComponent(rawCard.Spotify)}`;

    state.activeCard = {
      ...rawCard,
      metadata: {
        id: rawCard.Spotify,
        title: rawCard.title || 'Mystery Track',
        artist: rawCard.artist || 'Mystery Artist',
        year: rawCard.year || null,
        previewUrl: rawCard.previewUrl || null,
        coverUrl: null
      }
    };
    renderPlayersStrip();
    renderActivePlayerTimeline();

    if (document.body.classList.contains('tv-mode')) {
      requestAnimationFrame(() => {
        if (state.mode === 'party') {
          const selectedSlot = els.timelineTrack.querySelector('.timeline-slot.selected') || els.timelineTrack.querySelector('.timeline-slot');
          if (selectedSlot) {
            selectedSlot.focus({ preventScroll: true });
            return;
          }
        }
        els.revealCardBtn.focus({ preventScroll: true });
      });
    }

    // Clear any inline 3D tilt transform before flipping
    els.card3d.style.transform = '';

    try {
      const metadata = await fetchCardMetadata(rawCard.Spotify);
      if (drawId !== currentDrawId) return;

      // In TV mode without Spotify Premium SDK, if a track has no audio preview at all,
      // automatically draw the next card (up to 3 times) so TV playback never gets stuck!
      const isTvMode = document.body.classList.contains('tv-mode');
      if (isTvMode && !metadata.previewUrl && !(state.spotifyToken && state.spotifyDeviceId) && retryDepth < 3 && state.drawPile.length > 0) {
        console.warn('Track missing audio preview on TV, skipping to next playable card:', rawCard.Spotify);
        const nextRaw = state.drawPile.pop();
        updateDeckCounter();
        if (nextRaw) {
          await presentCardOnStage(nextRaw, retryDepth + 1);
          return;
        }
      }

      state.activeCard.metadata = metadata;

      els.revealYear.textContent = metadata.year || '????';
      els.revealArtist.textContent = metadata.artist || rawCard.artist || 'Unknown Artist';
      els.revealTitle.textContent = metadata.title || rawCard.title || 'Unknown Track';
      els.revealCoverImg.src = metadata.coverUrl || 'https://placehold.co/300x300/1b1435/ff2a85?text=MUSIC';
      els.cardBackBg.style.backgroundImage = metadata.coverUrl ? `url('${metadata.coverUrl}')` : 'none';
      els.openSpotifyLink.href = `https://open.spotify.com/track/${encodeURIComponent(rawCard.Spotify)}`;

      if (state.isRevealed && state.mode === 'party') {
        renderActivePlayerTimeline();
      }

      await startTrackPlayback(metadata);
      publishTvStateToRoom();
    } catch (err) {
      if (drawId !== currentDrawId) return;
      const isTvMode = document.body.classList.contains('tv-mode');
      if (isTvMode && retryDepth < 2 && state.drawPile.length > 0) {
        const nextRaw = state.drawPile.pop();
        updateDeckCounter();
        if (nextRaw) {
          await presentCardOnStage(nextRaw, retryDepth + 1);
          return;
        }
      }
      els.playbackStatusLabel.textContent = 'Could not load audio preview';
      console.error(err);
      publishTvStateToRoom();
    }
  }

  // --- Audio Playback Engine ---
  let currentPlayAttempt = 0;

  async function startTrackPlayback(metadata) {
    stopAudio();
    const attemptId = ++currentPlayAttempt;

    if (state.spotifyToken && state.spotifyDeviceId) {
      try {
        const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${state.spotifyDeviceId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${state.spotifyToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ uris: [`spotify:track:${metadata.id}`] })
        });
        if (res.ok || res.status === 204) {
          setPlayingUI(true, 'Playing via Spotify Premium');
          els.spotifyEmbedDrawer.classList.add('hidden');
          return;
        }
      } catch (err) {
        console.warn('Web Playback SDK play failed, using preview URL:', err);
      }
    }

    if (metadata.previewUrl) {
      els.spotifyEmbedDrawer.classList.add('hidden');
      els.playbackStatusLabel.textContent = 'Buffering audio...';

      // Properly reset Android WebView MediaPlayer pipeline before loading the next track
      audioEl.pause();
      audioEl.removeAttribute('src');
      audioEl.load();

      audioEl.src = metadata.previewUrl;
      audioEl.load();

      try {
        const playPromise = audioEl.play();
        if (playPromise !== undefined) {
          await Promise.race([
            playPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Audio play timeout')), 5000))
          ]);
        }
        if (attemptId === currentPlayAttempt) {
          setPlayingUI(true, 'Playing Track Preview');
        }
      } catch (playErr) {
        if (attemptId === currentPlayAttempt) {
          // Retry once on Android WebView media pipeline hiccup
          try {
            audioEl.load();
            await audioEl.play();
            setPlayingUI(true, 'Playing Track Preview');
          } catch (_) {
            setPlayingUI(false, 'Tap Play to start audio');
          }
        }
      }
      return;
    }

    els.playbackStatusLabel.textContent = 'Use Spotify widget below';
    els.spotifyEmbedDrawer.classList.remove('hidden');
    els.spotifyIframeContainer.classList.add('blurred');
    els.spotifyIframeContainer.innerHTML = `
      <iframe
        src="https://open.spotify.com/embed/track/${encodeURIComponent(metadata.id)}?utm_source=generator&theme=0"
        width="100%"
        height="80"
        frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy">
      </iframe>
    `;
  }

  function togglePlayPause() {
    if (!state.activeCard || !state.activeCard.metadata) return;

    if (state.sdkPlayer && state.spotifyDeviceId) {
      state.sdkPlayer.togglePlay();
      return;
    }

    if (audioEl.src) {
      if (audioEl.paused) {
        audioEl.play().then(() => setPlayingUI(true, 'Playing Track')).catch(() => {});
      } else {
        audioEl.pause();
        setPlayingUI(false, 'Track Stopped — Make your guess!');
      }
    }
  }

  function stopAudio() {
    if (!audioEl.paused) {
      audioEl.pause();
    }
    if (state.sdkPlayer && state.spotifyDeviceId) {
      state.sdkPlayer.pause().catch(() => {});
    }
    setPlayingUI(false, 'Track Stopped');
  }

  function setPlayingUI(playing, statusText) {
    state.isPlaying = playing;
    if (statusText) {
      els.playbackStatusLabel.textContent = statusText;
    }
    if (playing) {
      els.vinylDisc.classList.add('spinning');
      els.tonearm.classList.add('engaged');
      els.audioVisualizer.classList.add('playing');
      els.iconPlay.classList.add('hidden');
      els.iconPause.classList.remove('hidden');
      els.backPlayBtnText.textContent = 'Pause';
    } else {
      els.vinylDisc.classList.remove('spinning');
      els.tonearm.classList.remove('engaged');
      els.audioVisualizer.classList.remove('playing');
      els.iconPlay.classList.remove('hidden');
      els.iconPause.classList.add('hidden');
      els.backPlayBtnText.textContent = 'Play Track';
    }
    publishTvStateToRoom();
  }

  audioEl.addEventListener('timeupdate', () => {
    const cur = audioEl.currentTime || 0;
    const dur = audioEl.duration || 30;
    const pct = Math.min(100, (cur / dur) * 100);
    els.progressBarFill.style.width = `${pct}%`;
    const secs = Math.floor(cur);
    els.playbackTimer.textContent = `0:${String(secs).padStart(2, '0')}`;
  });

  audioEl.addEventListener('ended', () => {
    setPlayingUI(false, 'Preview finished — Replay or Flip Card!');
  });

  // --- Stopping the Track & Flipping the Card to Reveal ---
  function revealActiveCard() {
    if (!state.activeCard) return;

    stopAudio();

    state.isRevealed = true;
    // Clear inline style.transform set by 3D tilt physics so the 180deg flip works!
    els.card3d.style.transform = '';
    els.card3d.classList.add('is-flipped');
    els.spotifyIframeContainer.classList.remove('blurred');

    els.guessBox.classList.add('hidden');
    els.revealCardBtn.classList.add('hidden');
    els.flipBackBtn.classList.remove('hidden');

    if (state.mode === 'quickfire') {
      showQuickfireJudgePanel();
      publishTvStateToRoom();
      return;
    }

    els.verdictPanel.classList.remove('hidden');

    const meta = state.activeCard.metadata || {};
    const actualYear = meta.year || '????';
    const guessedArtistText = els.guessArtistInput.value.trim();
    const guessedYearVal = parseInt(els.guessYearInput.value, 10);

    if (state.mode === 'party') {
      const player = state.players[state.activePlayerIndex];
      const slotIdx = state.selectedSlotIndex !== null ? state.selectedSlotIndex : player.timeline.length;

      const prevYear = slotIdx > 0 ? player.timeline[slotIdx - 1].metadata.year : -Infinity;
      const nextYear = slotIdx < player.timeline.length ? player.timeline[slotIdx].metadata.year : Infinity;

      let isPlacementCorrect = (actualYear >= prevYear && actualYear <= nextYear);

      if (!isNaN(guessedYearVal) && guessedYearVal === actualYear) {
        isPlacementCorrect = true;
      }

      let bonusText = '';
      if (guessedArtistText) {
        const normGuess = guessedArtistText.toLowerCase();
        const normArtist = (meta.artist || '').toLowerCase();
        const normTitle = (meta.title || '').toLowerCase();
        if (normArtist.includes(normGuess) || normTitle.includes(normGuess) || normGuess.includes(normArtist)) {
          bonusText = ' 🎯 Great call on the Artist/Title!';
        }
      }

      if (isPlacementCorrect) {
        player.timeline.push(state.activeCard);
        els.verdictBanner.classList.remove('wrong');
        els.verdictIcon.textContent = '🎉';
        els.verdictTitle.textContent = `Correct! Released in ${actualYear}`;
        els.verdictSubtitle.textContent = `Card added to ${player.name}'s timeline!${bonusText}`;
      } else {
        els.verdictBanner.classList.add('wrong');
        els.verdictIcon.textContent = '❌';
        els.verdictTitle.textContent = `Missed! Released in ${actualYear}`;
        els.verdictSubtitle.textContent = `Needed a track between ${prevYear === -Infinity ? 'Start' : prevYear} and ${nextYear === Infinity ? 'Now' : nextYear}.${bonusText}`;
      }

      els.awardTokenBtn.classList.remove('hidden');
      els.awardTokenBtn.disabled = false;
      els.awardTokenBtn.textContent = '🪙 +1 Token (Guessed Artist & Song!)';

      renderPlayersStrip();
      renderActivePlayerTimeline();

      if (state.cardsToWin < 900 && player.timeline.length >= state.cardsToWin) {
        setTimeout(() => {
          els.winnerTitle.textContent = `${player.name} Wins!`;
          els.winnerSubtitle.textContent = `${player.name} completed a timeline of ${player.timeline.length} cards!`;
          els.winnerModal.classList.remove('hidden');
          if (document.body.classList.contains('tv-mode')) {
            requestAnimationFrame(() => {
              els.playAgainWinnerBtn.focus({ preventScroll: true });
            });
          }
        }, 900);
      } else if (document.body.classList.contains('tv-mode')) {
        requestAnimationFrame(() => {
          els.nextCardBtn.focus({ preventScroll: true });
        });
      }
    } else {
      // Lookup Mode Verdict
      els.verdictBanner.classList.remove('wrong');
      els.verdictIcon.textContent = '✨';
      els.verdictTitle.textContent = `${meta.artist} — ${meta.title} (${actualYear})`;
      if (!isNaN(guessedYearVal)) {
        const diff = Math.abs(guessedYearVal - actualYear);
        els.verdictSubtitle.textContent = diff === 0
          ? 'Spot on! You guessed the exact year!'
          : `You guessed ${guessedYearVal} (${diff} year${diff === 1 ? '' : 's'} off).`;
      } else {
        els.verdictSubtitle.textContent = `Card #${state.activeCard.CardNumber} revealed!`;
      }
      els.awardTokenBtn.classList.add('hidden');
      if (document.body.classList.contains('tv-mode')) {
        requestAnimationFrame(() => {
          els.nextCardBtn.focus({ preventScroll: true });
        });
      }
    }
    publishTvStateToRoom();
  }

  // --- Quickfire Party Mode: Success / Failure & Player Tally Assignment ---
  function showQuickfireJudgePanel() {
    els.verdictPanel.classList.add('hidden');
    els.quickfireJudgePanel.classList.remove('hidden');

    els.judgeHeaderLabel.classList.remove('hidden');
    els.judgeOutcomeButtons.classList.remove('hidden');
    els.judgeSuccessBtn.classList.remove('active');
    els.judgeFailBtn.classList.remove('active');
    els.assignPlayerPanel.classList.add('hidden');
    els.quickfireResultBar.classList.add('hidden');

    renderAssignPlayersButtons();
    requestAnimationFrame(() => {
      els.judgeSuccessBtn.focus({ preventScroll: true });
    });
  }

  function renderAssignPlayersButtons() {
    const existingBtns = els.assignPlayersGrid.querySelectorAll('.assign-player-btn');
    if (existingBtns.length === state.players.length) {
      state.players.forEach((player, idx) => {
        const btn = existingBtns[idx];
        const isAwarded = state.quickfirePointAwardedTo === idx;
        btn.classList.toggle('awarded', isAwarded);
        const nameSpan = btn.querySelector('.assign-player-name');
        const badgeSpan = btn.querySelector('.assign-plus-badge');
        if (nameSpan) nameSpan.textContent = player.name;
        if (badgeSpan) badgeSpan.textContent = isAwarded ? '✓ +1 Pt' : '+1 Pt';
      });
      return;
    }

    els.assignPlayersGrid.innerHTML = '';
    state.players.forEach((player, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isAwarded = state.quickfirePointAwardedTo === idx;
      btn.className = `assign-player-btn ${isAwarded ? 'awarded' : ''}`;
      btn.innerHTML = `
        <span class="assign-player-name">${escapeHtml(player.name)}</span>
        <span class="assign-plus-badge">${isAwarded ? '✓ +1 Pt' : '+1 Pt'}</span>
      `;
      btn.addEventListener('click', () => {
        assignQuickfireSuccessToPlayer(idx);
      });
      els.assignPlayersGrid.appendChild(btn);
    });
  }

  function handleQuickfireSuccessClick() {
    els.judgeSuccessBtn.classList.add('active');
    els.judgeFailBtn.classList.remove('active');

    // On TV Mode, hide the Success / Failure buttons & header once Success is pressed so player selection & Draw Next Card fit without scrolling
    if (document.body.classList.contains('tv-mode')) {
      els.judgeHeaderLabel.classList.add('hidden');
      els.judgeOutcomeButtons.classList.add('hidden');
    }

    // If only 1 player, award point immediately
    if (state.players.length === 1) {
      assignQuickfireSuccessToPlayer(0);
    } else {
      els.assignPlayerPanel.classList.remove('hidden');
      els.quickfireResultBar.classList.add('hidden');
      renderAssignPlayersButtons();
      if (document.body.classList.contains('tv-mode')) {
        requestAnimationFrame(() => {
          const firstPlayerBtn = els.assignPlayersGrid.querySelector('.assign-player-btn');
          if (firstPlayerBtn) firstPlayerBtn.focus({ preventScroll: true });
        });
      }
    }
  }

  function assignQuickfireSuccessToPlayer(playerIdx) {
    // On TV Mode, ensure Success / Failure buttons are hidden so the box stays compact
    if (document.body.classList.contains('tv-mode')) {
      els.judgeHeaderLabel.classList.add('hidden');
      els.judgeOutcomeButtons.classList.add('hidden');
    }
    els.assignPlayerPanel.classList.remove('hidden');

    // If another player was already awarded on this card, revert their point first so user can switch selection cleanly
    if (state.quickfirePointAwardedTo !== null && state.quickfirePointAwardedTo !== playerIdx) {
      const prevPlayer = state.players[state.quickfirePointAwardedTo];
      if (prevPlayer) prevPlayer.score = Math.max(0, prevPlayer.score - 1);
    }

    if (state.quickfirePointAwardedTo !== playerIdx) {
      const winner = state.players[playerIdx];
      if (winner) {
        winner.score += 1;
        state.quickfirePointAwardedTo = playerIdx;
        checkQuickfireWinner(winner);
      }
    }

    renderAssignPlayersButtons();
    renderPlayersStrip();

    const awardedPlayer = state.players[playerIdx];
    els.quickfireResultBar.classList.remove('hidden');
    els.quickfireResultMsg.className = 'quickfire-result-msg success';
    els.quickfireResultMsg.textContent = `🏆 +1 Point awarded to ${awardedPlayer.name}! (Total: ${awardedPlayer.score})`;

    // Keep TV D-Pad focus inside the Answer Box directly on the "Draw Next Card" button!
    requestAnimationFrame(() => {
      els.quickfireNextCardBtn.focus({ preventScroll: true });
    });

    publishTvStateToRoom();
  }

  function handleQuickfireFailClick() {
    // If a point was previously awarded on this turn, undo it
    if (state.quickfirePointAwardedTo !== null) {
      const prev = state.players[state.quickfirePointAwardedTo];
      if (prev) prev.score = Math.max(0, prev.score - 1);
      state.quickfirePointAwardedTo = null;
      renderPlayersStrip();
    }

    els.judgeFailBtn.classList.add('active');
    els.judgeSuccessBtn.classList.remove('active');
    els.assignPlayerPanel.classList.add('hidden');

    els.quickfireResultBar.classList.remove('hidden');
    els.quickfireResultMsg.className = 'quickfire-result-msg failure';
    els.quickfireResultMsg.textContent = '❌ No points awarded this round. Ready for the next track!';

    requestAnimationFrame(() => {
      els.quickfireNextCardBtn.focus({ preventScroll: true });
    });

    publishTvStateToRoom();
  }

  function advanceToNextTurn() {
    if (state.mode === 'party' && state.players.length > 1) {
      state.activePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
      renderPlayersStrip();
      renderActivePlayerTimeline();
    }
    drawNextMysteryCard();
  }

  // --- Realistic 3D Card Tilt & Glare Physics ---
  function setup3DTiltPhysics() {
    const scene = els.cardScene;

    function handleMove(clientX, clientY) {
      const rect = scene.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -10;
      const rotateYOffset = ((x - centerX) / centerX) * 12;
      const baseRotateY = state.isRevealed ? 180 : 0;

      els.card3d.style.transform = `rotateY(${baseRotateY + rotateYOffset}deg) rotateX(${rotateX}deg)`;

      const glareX = Math.round((x / rect.width) * 100);
      const glareY = Math.round((y / rect.height) * 100);
      els.cardFront.style.setProperty('--glare-x', `${glareX}%`);
      els.cardFront.style.setProperty('--glare-y', `${glareY}%`);
      els.cardBack.style.setProperty('--glare-x', `${100 - glareX}%`);
      els.cardBack.style.setProperty('--glare-y', `${glareY}%`);
    }

    function resetTilt() {
      // Remove inline transform so CSS .card-3d / .card-3d.is-flipped controls rotation cleanly
      els.card3d.style.transform = '';
    }

    scene.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
    scene.addEventListener('mouseleave', resetTilt);

    scene.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });
    scene.addEventListener('touchend', resetTilt);
  }

  // --- Editions Picker Modal ---
  function renderEditionsModalList(query) {
    const q = (query || '').toLowerCase().trim();
    const filtered = state.gamesets.filter(
      gs => gs.name.toLowerCase().includes(q) || gs.language.toLowerCase().includes(q) || gs.sku.toLowerCase().includes(q)
    );

    els.editionsList.innerHTML = '';
    filtered.forEach(gs => {
      const item = document.createElement('div');
      item.className = `edition-item ${gs.sku === state.currentSku ? 'active' : ''}`;
      item.innerHTML = `
        <div class="edition-item-title">${gs.isCustom ? '🎵 ' : ''}${escapeHtml(gs.name)}</div>
        <div class="edition-item-meta">
          <span>${gs.isCustom ? '✨ Custom Playlist' : '🌍 ' + escapeHtml(gs.language)}</span>
          <span>🎴 ${gs.cardCount} cards</span>
        </div>
      `;
      item.addEventListener('click', async () => {
        els.editionModal.classList.add('hidden');
        await selectGameset(gs.sku, true, false);
      });
      els.editionsList.appendChild(item);
    });
  }

  // --- Custom Spotify Playlist Studio & Diff Sync ---
  async function handlePlaylistSyncSubmit(urlOrId, customTitle) {
    if (!urlOrId) {
      alert('Please paste a Spotify Playlist link or ID.');
      return;
    }

    const origBtnText = els.syncPlaylistSubmitBtn.innerHTML;
    els.syncPlaylistSubmitBtn.disabled = true;
    els.syncPlaylistSubmitBtn.innerHTML = '<span>Syncing with Spotify...</span>';

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (state.spotifyToken) {
        headers['Authorization'] = `Bearer ${state.spotifyToken}`;
      }

      const res = await fetch('/api/playlists/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          playlistUrl: urlOrId,
          customTitle: customTitle || ''
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to sync playlist');
      }

      state.lastSyncedSku = data.playlist.sku;
      await loadGamesetsList();
      renderSyncDiffReport(data.playlist, data.diff, Boolean(data.isCatalogImport));
    } catch (err) {
      alert(err.message);
    } finally {
      els.syncPlaylistSubmitBtn.disabled = false;
      els.syncPlaylistSubmitBtn.innerHTML = origBtnText;
    }
  }

  function renderSyncDiffReport(playlist, diff, isCatalogImport = false) {
    els.syncReportCard.classList.remove('hidden');
    if (isCatalogImport) {
      els.syncReportTitle.textContent = `🔓 ${playlist.name} (${diff.totalTracks.toLocaleString()} cards stored!)`;
      els.playOnlyNewCustomBtn.classList.add('hidden');
      els.syncStatsGrid.innerHTML = `
        <div class="sync-stat-box">
          <span class="sync-stat-val highlight-cyan">${diff.newSinceLastSyncCount}</span>
          <span class="sync-stat-label">Editions Imported</span>
        </div>
        <div class="sync-stat-box">
          <span class="sync-stat-val highlight-new">${diff.totalTracks.toLocaleString()}</span>
          <span class="sync-stat-label">Total Cards Stored</span>
        </div>
      `;
      els.syncNewTracksList.classList.remove('hidden');
      els.syncNewTracksList.innerHTML = `<div class="sync-track-row"><span>All ${diff.newSinceLastSyncCount} editions are now saved to local storage and available in the Edition picker!</span></div>`;
      return;
    }

    els.syncReportTitle.textContent = diff.isFirstImport
      ? `✅ Imported "${playlist.name}" (${diff.totalTracks} tracks)`
      : `🔄 Synced "${playlist.name}" — ${diff.newSinceLastSyncCount} New Track${diff.newSinceLastSyncCount === 1 ? '' : 's'} Found!`;

    if (!diff.isFirstImport && diff.newSinceLastSyncCount > 0) {
      els.playOnlyNewCustomBtn.classList.remove('hidden');
      els.playOnlyNewCustomBtn.textContent = `Play ONLY ${diff.newSinceLastSyncCount} New Track${diff.newSinceLastSyncCount === 1 ? '' : 's'}`;
    } else {
      els.playOnlyNewCustomBtn.classList.add('hidden');
    }

    const uniqueCount = diff.brandNewCount ?? 0;
    const catalogCount = diff.inCatalogCount ?? 0;

    els.syncStatsGrid.innerHTML = `
      <div class="sync-stat-box">
        <span class="sync-stat-val">${diff.totalTracks}</span>
        <span class="sync-stat-label">Total Playlist Tracks</span>
      </div>
      <div class="sync-stat-box">
        <span class="sync-stat-val highlight-new">+${diff.newSinceLastSyncCount}</span>
        <span class="sync-stat-label">${diff.isFirstImport ? 'Added on First Import' : 'New Since Last Sync'}</span>
      </div>
      <div class="sync-stat-box">
        <span class="sync-stat-val highlight-cyan">${uniqueCount}</span>
        <span class="sync-stat-label">Unique to Your Playlist</span>
      </div>
      <div class="sync-stat-box">
        <span class="sync-stat-val">${catalogCount}</span>
        <span class="sync-stat-label">Also in Built-in Editions</span>
      </div>
    `;

    if (diff.newSinceLastSync && diff.newSinceLastSync.length > 0) {
      els.syncNewTracksList.classList.remove('hidden');
      els.syncNewTracksList.innerHTML = diff.newSinceLastSync.map(t => {
        const inBuiltIn = t.inCatalog;
        const eds = t.catalogEditions || [];
        return `
          <div class="sync-track-row">
            <span><strong>#${t.cardNumber}</strong> ${escapeHtml(t.artist)} — ${escapeHtml(t.title)}</span>
            <div style="display:flex;gap:6px;align-items:center;">
              <span class="track-badge-new">NEW</span>
              ${inBuiltIn
                ? `<span class="track-badge-official" title="Appears in: ${escapeHtml(eds.join(', '))}">In Built-in Catalog</span>`
                : ''}
            </div>
          </div>
        `;
      }).join('');
    } else {
      els.syncNewTracksList.classList.remove('hidden');
      els.syncNewTracksList.innerHTML = `<div class="sync-track-row"><span>No new tracks added to this Spotify playlist since your last sync.</span></div>`;
    }
  }

  function renderSavedCustomPlaylists() {
    if (!state.customPlaylists || state.customPlaylists.length === 0) {
      els.savedPlaylistsList.innerHTML = `<p class="modal-subtext">No custom playlists imported yet. Paste any Spotify playlist link above to create your first custom deck!</p>`;
      return;
    }

    els.savedPlaylistsList.innerHTML = '';
    state.customPlaylists.forEach(pl => {
      const row = document.createElement('div');
      row.className = 'saved-playlist-item';
      const syncDate = pl.lastSyncedAt ? new Date(pl.lastSyncedAt).toLocaleString() : 'Never';
      row.innerHTML = `
        <div class="saved-playlist-info">
          <img class="saved-playlist-cover" src="${pl.coverUrl || 'https://placehold.co/80x80/1b1435/00f0ff?text=🎵'}" alt="Cover" />
          <div class="saved-playlist-meta">
            <div class="saved-playlist-title">${escapeHtml(pl.name)}</div>
            <div class="saved-playlist-sub">🎴 ${pl.cardCount} tracks (${pl.newTracksCount || 0} new) • Last checked: ${escapeHtml(syncDate)}</div>
          </div>
        </div>
        <div class="saved-playlist-actions">
          <button class="secondary-btn mini-play-deck-btn btn-check-sync">🔄 Check New Tracks</button>
          <button class="primary-btn mini-play-deck-btn btn-play-custom">▶ Play</button>
          <button class="secondary-btn mini-play-deck-btn btn-delete-custom" title="Remove">🗑</button>
        </div>
      `;

      row.querySelector('.btn-check-sync').addEventListener('click', () => {
        els.playlistUrlInput.value = `https://open.spotify.com/playlist/${pl.playlistId}`;
        els.playlistNameInput.value = pl.name;
        handlePlaylistSyncSubmit(pl.playlistId, pl.name);
      });

      row.querySelector('.btn-play-custom').addEventListener('click', async () => {
        els.playlistModal.classList.add('hidden');
        await selectGameset(pl.sku, true, false);
      });

      row.querySelector('.btn-delete-custom').addEventListener('click', async () => {
        await fetch(`/api/playlists/${encodeURIComponent(pl.sku)}`, { method: 'DELETE' });
        await loadGamesetsList();
      });

      els.savedPlaylistsList.appendChild(row);
    });
  }

  // --- Spotify OAuth PKCE & Web Playback SDK ---
  async function startSpotifyPKCEFlow() {
    const clientId = els.spotifyClientIdInput.value.trim();
    if (!clientId) {
      alert('Please enter your Spotify Developer Client ID first, or paste an Access Token directly.');
      return;
    }
    state.spotifyClientId = clientId;
    localStorage.setItem('beatdrop_spotify_client_id', clientId);

    const verifier = generateRandomString(64);
    localStorage.setItem('beatdrop_pkce_verifier', verifier);
    const challenge = await generateCodeChallenge(verifier);
    const redirectUri = window.location.origin + '/';
    const scope = 'streaming user-read-email user-read-private user-modify-playback-state';

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('redirect_uri', redirectUri);

    window.location.href = authUrl.toString();
  }

  async function handleSpotifyOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    const verifier = localStorage.getItem('beatdrop_pkce_verifier');
    const clientId = localStorage.getItem('beatdrop_spotify_client_id');
    if (!verifier || !clientId) return;

    try {
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: 'authorization_code',
          code,
          redirect_uri: window.location.origin + '/',
          code_verifier: verifier
        })
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        state.spotifyToken = tokenData.access_token;
        localStorage.setItem('beatdrop_spotify_token', state.spotifyToken);
        els.spotifyTokenInput.value = state.spotifyToken;
      }
    } catch (err) {
      console.error('Spotify PKCE token exchange failed:', err);
    } finally {
      window.history.replaceState({}, document.title, '/');
    }
  }

  function initSpotifyWebPlaybackSDK() {
    if (!state.spotifyToken || window.Spotify) return;
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: 'BEATDROP Web Party Player',
        getOAuthToken: cb => { cb(state.spotifyToken); },
        volume: 0.85
      });

      player.addListener('ready', ({ device_id }) => {
        state.spotifyDeviceId = device_id;
        state.sdkPlayer = player;
        updateSpotifyPillStatus();
      });

      player.addListener('player_state_changed', (sdkState) => {
        if (!sdkState) return;
        setPlayingUI(!sdkState.paused, sdkState.paused ? 'Track Paused' : 'Playing Full Track (Spotify)');
      });

      player.connect();
    };
  }

  function updateSpotifyPillStatus() {
    if (state.spotifyDeviceId) {
      els.spotifyStatusText.textContent = 'Spotify Premium Connected';
    } else if (state.spotifyToken) {
      els.spotifyStatusText.textContent = 'Spotify API Linked';
    } else {
      els.spotifyStatusText.textContent = 'Spotify Ready';
    }
  }

  function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(values).map(x => possible[x % possible.length]).join('');
  }

  async function generateCodeChallenge(codeVerifier) {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // --- Synced TV Receiver Mode (/tv) & Phone Remote Sync ---
  let tvRoomCode = null;

  async function initSyncedTvReceiverMode() {
    document.body.classList.add('tv-mode');

    const params = new URLSearchParams(window.location.search);
    tvRoomCode = (params.get('room') || localStorage.getItem('beatdrop_tv_room') || generateRoomCode()).toUpperCase();
    localStorage.setItem('beatdrop_tv_room', tvRoomCode);

    // Fetch local LAN IP so the QR code works from any phone on the same Wi-Fi even if TV opened localhost
    let hostOrigin = window.location.origin;
    try {
      const lanRes = await fetch('/api/lan-info');
      if (lanRes.ok) {
        const lanData = await lanRes.json();
        if (lanData.lanIp && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
          hostOrigin = `http://${lanData.lanIp}:${lanData.port || 3000}`;
        }
      }
    } catch (_) {}

    const remoteUrl = `${hostOrigin}/remote?room=${encodeURIComponent(tvRoomCode)}`;
    const isHttps = remoteUrl.startsWith('https://');
    els.tvRoomCorner.classList.remove('hidden');
    els.tvRoomCodeLabel.textContent = `ROOM: ${tvRoomCode}`;
    // Explicitly display http:// when running on a local Wi-Fi IP so mobile Chrome doesn't default to https:// (which causes ERR_CONNECTION_REFUSED)
    els.tvRoomUrlLabel.textContent = isHttps ? remoteUrl.replace(/^https:\/\//, '') : remoteUrl;
    els.tvQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=4&data=${encodeURIComponent(remoteUrl)}`;

    // Click/tap TV Room bar to toggle QR code visibility manually at any time
    els.tvRoomCorner.addEventListener('click', () => {
      els.tvRoomCorner.classList.toggle('connected');
    });

    // Subscribe to commands & remote presence from Phone Remote controllers via SSE
    const evSource = new EventSource(`/api/room/${encodeURIComponent(tvRoomCode)}/events`);
    evSource.addEventListener('presence', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (typeof data.remoteCount === 'number' && data.remoteCount > 0) {
          setTvRemoteConnected(true);
        }
      } catch (_) {}
    });
    evSource.addEventListener('command', async (e) => {
      try {
        setTvRemoteConnected(true);
        const cmd = JSON.parse(e.data);
        await handleRemoteCommandOnTv(cmd);
      } catch (err) {
        console.error('Error handling remote command:', err);
      }
    });

    // Publish initial TV state to the room
    publishTvStateToRoom();
  }

  function setTvRemoteConnected(connected) {
    if (!els.tvRoomCorner) return;
    if (connected) {
      els.tvRoomCorner.classList.add('connected');
      const tagEl = els.tvRoomCorner.querySelector('.tv-room-tag');
      if (tagEl) tagEl.textContent = '🟢 REMOTE CONNECTED';
    }
  }

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 4; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  async function publishTvStateToRoom() {
    if (!tvRoomCode) return;
    const payload = {
      roomCode: tvRoomCode,
      mode: state.mode,
      editionSku: state.currentSku,
      editionName: state.currentEditionName,
      deckCount: state.drawPile.length,
      cardsToWin: state.cardsToWin,
      players: state.players.map(p => ({
        name: p.name,
        score: p.score,
        tokens: p.tokens,
        timelineCount: p.timeline.length
      })),
      activePlayerIndex: state.activePlayerIndex,
      quickfirePointAwardedTo: state.quickfirePointAwardedTo,
      isPlaying: state.isPlaying,
      isRevealed: state.isRevealed,
      activeCard: state.activeCard ? {
        CardNumber: state.activeCard.CardNumber,
        ArtistType: state.activeCard.ArtistType,
        isNew: Boolean(state.activeCard.isNew),
        // Only expose song answer to the remote after the card is flipped!
        metadata: state.isRevealed && state.activeCard.metadata ? {
          title: state.activeCard.metadata.title,
          artist: state.activeCard.metadata.artist,
          year: state.activeCard.metadata.year,
          coverUrl: state.activeCard.metadata.coverUrl
        } : null
      } : null
    };

    try {
      await fetch(`/api/room/${encodeURIComponent(tvRoomCode)}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (_) {}
  }

  async function handleRemoteCommandOnTv(cmd) {
    if (!cmd || !cmd.action) return;
    switch (cmd.action) {
      case 'draw':
        await drawNextMysteryCard();
        break;
      case 'toggle_play':
        togglePlayPause();
        break;
      case 'reveal':
        revealActiveCard();
        break;
      case 'flip_toggle':
        if (state.activeCard) {
          state.isRevealed = !state.isRevealed;
          els.card3d.style.transform = '';
          els.card3d.classList.toggle('is-flipped', state.isRevealed);
        }
        break;
      case 'judge_success':
        handleQuickfireSuccessClick();
        break;
      case 'judge_fail':
        handleQuickfireFailClick();
        break;
      case 'award_player':
        if (typeof cmd.playerIndex === 'number') {
          els.judgeSuccessBtn.classList.add('active');
          els.judgeFailBtn.classList.remove('active');
          els.assignPlayerPanel.classList.remove('hidden');
          assignQuickfireSuccessToPlayer(cmd.playerIndex);
        }
        break;
      case 'adjust_score':
        if (typeof cmd.playerIndex === 'number' && state.players[cmd.playerIndex]) {
          state.players[cmd.playerIndex].score = Math.max(0, state.players[cmd.playerIndex].score + (cmd.delta || 0));
          renderPlayersStrip();
          checkQuickfireWinner(state.players[cmd.playerIndex]);
        }
        break;
      case 'set_players':
        if (Array.isArray(cmd.playerNames)) {
          els.winnerModal.classList.add('hidden');
          await startNewGameSession(cmd.playerNames, cmd.cardsToWin || state.cardsToWin);
        }
        break;
      case 'select_edition':
        if (cmd.sku) {
          await selectGameset(cmd.sku, true, Boolean(cmd.onlyNew));
        }
        break;
      case 'switch_mode':
        if (cmd.mode) {
          await switchMode(cmd.mode);
        }
        break;
    }
    publishTvStateToRoom();
  }

  function setupTvRemoteAndKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        return;
      }

      if (e.key === 'Escape') {
        els.editionModal.classList.add('hidden');
        els.setupModal.classList.add('hidden');
        els.spotifyModal.classList.add('hidden');
        els.playlistModal.classList.add('hidden');
        els.winnerModal.classList.add('hidden');
        return;
      }

      // Support Chromecast / Android TV hardware media Play/Pause button
      if (e.key === 'MediaPlayPause') {
        e.preventDefault();
        togglePlayPause();
        publishTvStateToRoom();
      }
    });
  }

  // --- UI Event Listeners ---
  function setupEventListeners() {
    setupTvRemoteAndKeyboardShortcuts();

    // Mode switching
    els.modeQuickfireBtn.addEventListener('click', () => switchMode('quickfire'));
    els.modePartyBtn.addEventListener('click', () => switchMode('party'));
    els.modeLookupBtn.addEventListener('click', () => switchMode('lookup'));

    // Draw Card actions
    els.drawDeckStack.addEventListener('click', () => drawNextMysteryCard());
    els.drawFirstCardBtn.addEventListener('click', () => drawNextMysteryCard());
    els.nextCardBtn.addEventListener('click', () => advanceToNextTurn());
    els.quickfireNextCardBtn.addEventListener('click', () => drawNextMysteryCard());

    // Quickfire Judge buttons
    els.judgeSuccessBtn.addEventListener('click', handleQuickfireSuccessClick);
    els.judgeFailBtn.addEventListener('click', handleQuickfireFailClick);

    // Play / Pause controls
    els.playPauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePlayPause();
    });
    els.backPlayPauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePlayPause();
    });

    // Seek on progress bar click
    els.progressBarBg.addEventListener('click', (e) => {
      if (!audioEl.src || !audioEl.duration) return;
      const rect = els.progressBarBg.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audioEl.currentTime = pct * audioEl.duration;
    });

    // Reveal / Flip card
    els.revealCardBtn.addEventListener('click', () => revealActiveCard());
    els.flipBackBtn.addEventListener('click', () => {
      state.isRevealed = !state.isRevealed;
      els.card3d.style.transform = '';
      els.card3d.classList.toggle('is-flipped', state.isRevealed);
    });

    // Award Token button (Timeline mode)
    els.awardTokenBtn.addEventListener('click', () => {
      if (state.tokenAwardedThisTurn) return;
      const player = state.players[state.activePlayerIndex];
      if (player) {
        player.tokens += 1;
        state.tokenAwardedThisTurn = true;
        els.awardTokenBtn.disabled = true;
        els.awardTokenBtn.textContent = '🪙 Token Awarded!';
        renderPlayersStrip();
      }
    });

    // Lookup mode controls
    els.loadCardNumBtn.addEventListener('click', () => {
      const val = parseInt(els.cardNumberInput.value, 10);
      if (!isNaN(val) && val > 0) {
        loadSpecificCardNumber(val);
      }
    });
    els.cardNumberInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') els.loadCardNumBtn.click();
    });
    els.randomLookupBtn.addEventListener('click', () => drawNextMysteryCard());

    // Toggle raw Spotify iframe spoiler shield
    els.toggleRawEmbedBtn.addEventListener('click', () => {
      els.spotifyIframeContainer.classList.toggle('blurred');
    });

    // Custom Playlist Studio Modal
    els.customPlaylistBtn.addEventListener('click', () => {
      els.playlistModal.classList.remove('hidden');
      els.playlistUrlInput.focus();
    });
    els.closePlaylistModalBtn.addEventListener('click', () => {
      els.playlistModal.classList.add('hidden');
    });
    els.syncPlaylistSubmitBtn.addEventListener('click', () => {
      handlePlaylistSyncSubmit(els.playlistUrlInput.value, els.playlistNameInput.value);
    });
    els.playlistUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handlePlaylistSyncSubmit(els.playlistUrlInput.value, els.playlistNameInput.value);
    });
    els.playAllCustomBtn.addEventListener('click', async () => {
      if (!state.lastSyncedSku) return;
      els.playlistModal.classList.add('hidden');
      await selectGameset(state.lastSyncedSku, true, false);
    });
    els.playOnlyNewCustomBtn.addEventListener('click', async () => {
      if (!state.lastSyncedSku) return;
      els.playlistModal.classList.add('hidden');
      await selectGameset(state.lastSyncedSku, true, true);
    });

    // Edition Modal
    els.editionSelectBtn.addEventListener('click', () => {
      els.editionModal.classList.remove('hidden');
      els.editionSearchInput.focus();
    });
    els.closeEditionModalBtn.addEventListener('click', () => els.editionModal.classList.add('hidden'));
    els.editionSearchInput.addEventListener('input', (e) => renderEditionsModalList(e.target.value));

    // New Game Setup Modal
    els.newGameBtn.addEventListener('click', () => els.setupModal.classList.remove('hidden'));
    els.closeSetupModalBtn.addEventListener('click', () => els.setupModal.classList.add('hidden'));
    els.addPlayerInputBtn.addEventListener('click', () => {
      const count = els.setupPlayersInputs.querySelectorAll('input').length;
      if (count >= 8) return;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'player-name-input';
      input.placeholder = `Player ${count + 1} Name`;
      input.value = `Player ${count + 1}`;
      els.setupPlayersInputs.appendChild(input);
    });
    els.startNewGameConfirmBtn.addEventListener('click', async () => {
      const inputs = els.setupPlayersInputs.querySelectorAll('input');
      const names = Array.from(inputs).map(i => i.value);
      const goal = parseInt(els.cardsToWinSelect.value, 10) || 10;
      els.setupModal.classList.add('hidden');
      await startNewGameSession(names, goal);
    });

    // Winner modal
    els.playAgainWinnerBtn.addEventListener('click', async () => {
      els.winnerModal.classList.add('hidden');
      if (document.body.classList.contains('tv-mode')) {
        const existingNames = state.players.map(p => p.name);
        await startNewGameSession(existingNames, state.cardsToWin);
        publishTvStateToRoom();
        requestAnimationFrame(() => {
          els.drawFirstCardBtn.focus({ preventScroll: true });
        });
      } else {
        els.setupModal.classList.remove('hidden');
      }
    });

    // Spotify Modal
    els.spotifyConnectBtn.addEventListener('click', () => els.spotifyModal.classList.remove('hidden'));
    els.closeSpotifyModalBtn.addEventListener('click', () => els.spotifyModal.classList.add('hidden'));
    els.spotifyOAuthLoginBtn.addEventListener('click', startSpotifyPKCEFlow);
    els.saveSpotifySettingsBtn.addEventListener('click', () => {
      state.spotifyClientId = els.spotifyClientIdInput.value.trim();
      state.spotifyToken = els.spotifyTokenInput.value.trim();
      localStorage.setItem('beatdrop_spotify_client_id', state.spotifyClientId);
      localStorage.setItem('beatdrop_spotify_token', state.spotifyToken);
      updateSpotifyPillStatus();
      if (state.spotifyToken) initSpotifyWebPlaybackSDK();
      els.spotifyModal.classList.add('hidden');
    });
    els.clearSpotifyTokenBtn.addEventListener('click', () => {
      state.spotifyToken = '';
      state.spotifyDeviceId = null;
      localStorage.removeItem('beatdrop_spotify_token');
      els.spotifyTokenInput.value = '';
      updateSpotifyPillStatus();
    });
  }

  async function switchMode(newMode) {
    state.mode = newMode;
    els.modeQuickfireBtn.classList.toggle('active', newMode === 'quickfire');
    els.modePartyBtn.classList.toggle('active', newMode === 'party');
    els.modeLookupBtn.classList.toggle('active', newMode === 'lookup');

    els.playersStrip.classList.toggle('hidden', newMode === 'lookup');
    els.timelineSection.classList.toggle('hidden', newMode !== 'party');
    els.lookupBar.classList.toggle('hidden', newMode !== 'lookup');

    if (newMode === 'quickfire') {
      els.emptyStageTitle.textContent = 'Quickfire Party Mode';
      els.emptyStageDesc.textContent = 'Draw a random mystery card! First player to shout out the Artist & Song stops the track and flips the card to score a point!';
    } else if (newMode === 'party') {
      els.emptyStageTitle.textContent = 'Chronological Timeline Mode';
      els.emptyStageDesc.textContent = 'Tap the deck to draw a mystery song card, place it in the right chronological slot on your timeline, and flip to reveal!';
      await ensureTimelineStarterCards();
    } else {
      els.emptyStageTitle.textContent = 'Card Number Lookup';
      els.emptyStageDesc.textContent = 'Enter any card number above or draw a random card to play and reveal!';
    }

    // If a card is currently revealed on stage, update the post-reveal controls to match the active mode
    if (state.activeCard && state.isRevealed) {
      if (newMode === 'quickfire') {
        showQuickfireJudgePanel();
      } else {
        els.quickfireJudgePanel.classList.add('hidden');
        els.verdictPanel.classList.remove('hidden');
      }
    }

    renderPlayersStrip();
    renderActivePlayerTimeline();

    if (document.body.classList.contains('tv-mode')) {
      requestAnimationFrame(() => {
        if (state.mode === 'party') {
          const selectedSlot = els.timelineTrack.querySelector('.timeline-slot.selected') || els.timelineTrack.querySelector('.timeline-slot');
          if (selectedSlot) {
            selectedSlot.focus({ preventScroll: true });
            return;
          }
        }
        els.revealCardBtn.focus({ preventScroll: true });
      });
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Start app
  init();
})();
