import React, { useState, useEffect, useRef } from 'react';
import { User, Settings, Play, Pause, RotateCcw, Users, Crown, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, off } from 'firebase/database';
import './App.css';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAGDouQto7NY-ghGuopdDuT2rohG1CuLEk",
  authDomain: "taekwondo-kyorugi-scoring.firebaseapp.com",
  databaseURL: "https://taekwondo-kyorugi-scoring-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "taekwondo-kyorugi-scoring",
  storageBucket: "taekwondo-kyorugi-scoring.firebasestorage.app",
  messagingSenderId: "404562865335",
  appId: "1:404562865335:web:35dffea9368721a31f3132",
  measurementId: "G-4HK6NHES47"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const TaekwondoScoringApp = () => {
  // State management
  const [currentView, setCurrentView] = useState('login');
  const [user, setUser] = useState(null);
  const [matchUsers, setMatchUsers] = useState([]);
  const [matchId, setMatchId] = useState('');
  const [isConnected, setIsConnected] = useState(true);
  
  // Match configuration
  const [buttonConfig, setButtonConfig] = useState({
    red: [
      { label: 'Body Strike', points: 2 },
      { label: 'Head Strike', points: 3 },
      { label: 'Body Kick', points: 2 },
      { label: 'Head Kick', points: 3 }
    ],
    blue: [
      { label: 'Body Strike', points: 2 },
      { label: 'Head Strike', points: 3 },
      { label: 'Body Kick', points: 2 },
      { label: 'Head Kick', points: 3 }
    ]
  });
  
  const [roundDuration, setRoundDuration] = useState(120);
  const [maxPenalties, setMaxPenalties] = useState(10);
  
  // Match state
  const [scores, setScores] = useState({ red: 0, blue: 0 });
  const [penalties, setPenalties] = useState({ red: 0, blue: 0 });
  const [currentRound, setCurrentRound] = useState(1);
  const [roundsWon, setRoundsWon] = useState({ red: 0, blue: 0 });
  const [timeLeft, setTimeLeft] = useState(120);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [matchEnded, setMatchEnded] = useState(false);
  const [winner, setWinner] = useState('');
  
  // Scoring coordination
  const [pendingScores, setPendingScores] = useState({});
  const timerRef = useRef(null);

  // Firebase sync functions
  const syncToFirebase = (matchData) => {
    if (!database || !matchId) return;
    
    const matchRef = ref(database, `matches/${matchId}`);
    set(matchRef, {
      ...matchData,
      lastUpdated: Date.now(),
      lastUpdatedBy: user?.id
    }).catch(error => {
      console.error('Error syncing to Firebase:', error);
      setIsConnected(false);
    });
  };

  const listenToFirebase = () => {
    if (!database || !matchId) return;
    
    const matchRef = ref(database, `matches/${matchId}`);
    const usersRef = ref(database, `matches/${matchId}/users`);
    
    const matchListener = onValue(matchRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.lastUpdatedBy !== user?.id) {
        setScores(data.scores || { red: 0, blue: 0 });
        setPenalties(data.penalties || { red: 0, blue: 0 });
        setCurrentRound(data.currentRound || 1);
        setRoundsWon(data.roundsWon || { red: 0, blue: 0 });
        setTimeLeft(data.timeLeft || roundDuration);
        setIsTimerRunning(data.isTimerRunning || false);
        setMatchEnded(data.matchEnded || false);
        setWinner(data.winner || '');
        if (data.buttonConfig) {
          setButtonConfig(data.buttonConfig);
        }
        if (data.roundDuration) {
          setRoundDuration(data.roundDuration);
        }
        if (data.maxPenalties) {
          setMaxPenalties(data.maxPenalties);
        }
      }
      setIsConnected(true);
    }, (error) => {
      console.error('Firebase listen error:', error);
      setIsConnected(false);
    });

    const usersListener = onValue(usersRef, (snapshot) => {
      const users = snapshot.val();
      if (users) {
        setMatchUsers(Object.values(users));
      }
    });

    return () => {
      off(matchRef);
      off(usersRef);
    };
  };

  // Timer effect
  useEffect(() => {
    if (isTimerRunning && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          const newTime = prev <= 1 ? 0 : prev - 1;
          
          if (matchId && database) {
            syncToFirebase({
              scores,
              penalties,
              currentRound,
              roundsWon,
              timeLeft: newTime,
              isTimerRunning: newTime > 0,
              matchEnded,
              winner,
              users: matchUsers,
              buttonConfig,
              roundDuration,
              maxPenalties
            });
          }
          
          if (newTime <= 0) {
            setIsTimerRunning(false);
            handleRoundEnd();
          }
          
          return newTime;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    
    return () => clearInterval(timerRef.current);
  }, [isTimerRunning, timeLeft]);

  // Sync state changes to Firebase
  useEffect(() => {
    if (matchId && database) {
      syncToFirebase({
        scores,
        penalties,
        currentRound,
        roundsWon,
        timeLeft,
        isTimerRunning,
        matchEnded,
        winner,
        users: matchUsers,
        buttonConfig,
        roundDuration,
        maxPenalties
      });
    }
  }, [scores, penalties, currentRound, roundsWon, isTimerRunning, matchEnded, winner]);

  // Format time display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle login
  const handleLogin = (name, role) => {
    const newUser = { name, role, id: Date.now() + Math.random() };
    setUser(newUser);
    setCurrentView('lobby');
  };

  // Join or create match
  const joinMatch = (id) => {
    setMatchId(id);
    const updatedUsers = [...matchUsers.filter(u => u.id !== user.id), user];
    setMatchUsers(updatedUsers);
    setIsConnected(true);
    
    if (database) {
      const userRef = ref(database, `matches/${id}/users/${user.id}`);
      set(userRef, user);
      listenToFirebase();
    }
    
    setCurrentView('match');
  };

  // Handle scoring with coordination
  const handleScore = (player, buttonIndex) => {
    const scoreKey = `${player}-${buttonIndex}`;
    const now = Date.now();
    
    const headOfCourt = matchUsers.find(u => u.role === 'Head of Court');
    const cornerReferees = matchUsers.filter(u => u.role === 'Corner Referee');
    const needsCoordination = (headOfCourt && cornerReferees.length > 0) || cornerReferees.length > 1;
    
    if (!needsCoordination) {
      applyScore(player, buttonIndex);
      return;
    }
    
    if (database && matchId) {
      const pendingRef = ref(database, `matches/${matchId}/pendingScores/${scoreKey}`);
      set(pendingRef, {
        userId: user.id,
        timestamp: now,
        player,
        buttonIndex
      });
    }
    
    const existingPending = pendingScores[scoreKey];
    if (existingPending && (now - existingPending.timestamp) < 500 && existingPending.userId !== user.id) {
      applyScore(player, buttonIndex);
      setPendingScores(prev => {
        const newPending = { ...prev };
        delete newPending[scoreKey];
        return newPending;
      });
    } else {
      setPendingScores(prev => ({
        ...prev,
        [scoreKey]: { userId: user.id, timestamp: now }
      }));
      
      setTimeout(() => {
        setPendingScores(prev => {
          const newPending = { ...prev };
          if (newPending[scoreKey] && newPending[scoreKey].timestamp === now) {
            delete newPending[scoreKey];
          }
          return newPending;
        });
      }, 500);
    }
  };

  // Apply score to match
  const applyScore = (player, buttonIndex) => {
    const points = buttonConfig[player][buttonIndex].points;
    setScores(prev => ({
      ...prev,
      [player]: prev[player] + points
    }));
  };

  // Handle penalties (Head of Court only)
  const handlePenalty = (player) => {
    if (user.role !== 'Head of Court') return;
    
    setPenalties(prev => {
      const newPenalties = {
        ...prev,
        [player]: prev[player] + 1
      };
      
      if (newPenalties[player] >= maxPenalties) {
        setIsTimerRunning(false);
        setTimeLeft(0);
        handleRoundEnd();
      }
      
      return newPenalties;
    });
    
    const opponent = player === 'red' ? 'blue' : 'red';
    setScores(prev => ({
      ...prev,
      [opponent]: prev[opponent] + 1
    }));
  };

  // Handle round end
  const handleRoundEnd = () => {
    const roundWinner = scores.red > scores.blue ? 'red' : 
                       scores.blue > scores.red ? 'blue' : 'tie';
    
    if (roundWinner !== 'tie') {
      const newRoundsWon = {
        ...roundsWon,
        [roundWinner]: roundsWon[roundWinner] + 1
      };
      setRoundsWon(newRoundsWon);
      
      if (newRoundsWon[roundWinner] >= 2) {
        endMatch(roundWinner, 'rounds');
        return;
      }
    }
    
    if (currentRound < 3) {
      setCurrentRound(prev => prev + 1);
      setScores({ red: 0, blue: 0 });
      setPenalties({ red: 0, blue: 0 });
      setTimeLeft(roundDuration);
    } else {
      const finalWinner = roundsWon.red > roundsWon.blue ? 'red' : 
                         roundsWon.blue > roundsWon.red ? 'blue' : 'tie';
      endMatch(finalWinner, 'decision');
    }
  };

  // End match
  const endMatch = (winner, reason) => {
    setMatchEnded(true);
    setWinner(winner);
    setIsTimerRunning(false);
  };

  // Reset match (Head of Court only)
  const resetMatch = () => {
    if (user.role !== 'Head of Court') return;
    
    setScores({ red: 0, blue: 0 });
    setPenalties({ red: 0, blue: 0 });
    setCurrentRound(1);
    setRoundsWon({ red: 0, blue: 0 });
    setTimeLeft(roundDuration);
    setIsTimerRunning(false);
    setMatchEnded(false);
    setWinner('');
    setPendingScores({});
  };

  // Start/stop timer (Head of Court only)
  const toggleTimer = () => {
    if (user.role !== 'Head of Court') return;
    setIsTimerRunning(!isTimerRunning);
  };

  // Login View
  if (currentView === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-blue-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Taekwondo Scoring</h1>
            <p className="text-gray-600">Multi-Device Real-Time Scoring</p>
            <div className="flex items-center justify-center mt-2">
              {isConnected ? (
                <><Wifi className="w-4 h-4 text-green-500 mr-1" /><span className="text-green-600 text-sm">Connected</span></>
              ) : (
                <><WifiOff className="w-4 h-4 text-red-500 mr-1" /><span className="text-red-600 text-sm">Offline Mode</span></>
              )}
            </div>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
              <input
                id="loginName"
                type="text"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your name"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
              <select
                id="loginRole"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select your role</option>
                <option value="Head of Court">Head of Court/Single Referee</option>
                <option value="Corner Referee">Corner Referee</option>
              </select>
            </div>
            
            <button
              onClick={() => {
                const name = document.getElementById('loginName').value;
                const role = document.getElementById('loginRole').value;
                if (name && role) {
                  handleLogin(name, role);
                }
              }}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Lobby View
  if (currentView === 'lobby') {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                {user.role === 'Head of Court' ? <Crown className="mr-2 text-yellow-500" /> : <User className="mr-2 text-blue-500" />}
                <div>
                  <h2 className="font-bold">{user.name}</h2>
                  <p className="text-sm text-gray-600">{user.role}</p>
                </div>
              </div>
              <div className="flex items-center">
                {isConnected ? (
                  <><Wifi className="w-4 h-4 text-green-500 mr-1" /><span className="text-green-600 text-xs">Online</span></>
                ) : (
                  <><WifiOff className="w-4 h-4 text-red-500 mr-1" /><span className="text-red-600 text-xs">Offline</span></>
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h3 className="font-bold text-lg mb-4">Join Match</h3>
            <div>
              <input
                id="matchIdInput"
                type="text"
                placeholder="Enter Match ID (e.g., MATCH001)"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-4"
              />
              <button
                onClick={() => {
                  const matchId = document.getElementById('matchIdInput').value;
                  if (matchId) {
                    joinMatch(matchId);
                  }
                }}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
              >
                Join Match
              </button>
            </div>
          </div>
          
          <button
            onClick={() => setCurrentView('settings')}
            className="w-full bg-gray-600 text-white py-3 rounded-lg font-medium hover:bg-gray-700 flex items-center justify-center"
          >
            <Settings className="mr-2" size={20} />
            Settings
          </button>
        </div>
      </div>
    );
  }

  // Settings View
  if (currentView === 'settings') {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold mb-6">Match Settings</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Round Duration (seconds)</label>
                <input
                  type="number"
                  value={roundDuration}
                  onChange={(e) => {
                    const newDuration = parseInt(e.target.value);
                    setRoundDuration(newDuration);
                    if (!isTimerRunning) {
                      setTimeLeft(newDuration);
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Penalties per Round</label>
                <input
                  type="number"
                  value={maxPenalties}
                  onChange={(e) => setMaxPenalties(parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">Round ends when a player reaches this penalty count</p>
              </div>
              
              <div>
                <h3 className="font-medium text-gray-700 mb-3">Scoring Buttons Configuration</h3>
                <p className="text-sm text-gray-500 mb-4">Changes apply to both Red and Blue players</p>
                {buttonConfig.red.map((btn, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-2 mb-2">
                    <input
                      type="text"
                      value={btn.label}
                      onChange={(e) => {
                        const newConfig = { ...buttonConfig };
                        newConfig.red[idx].label = e.target.value;
                        newConfig.blue[idx].label = e.target.value;
                        setButtonConfig(newConfig);
                      }}
                      className="px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="Label"
                    />
                    <input
                      type="number"
                      value={btn.points}
                      onChange={(e) => {
                        const newConfig = { ...buttonConfig };
                        newConfig.red[idx].points = parseInt(e.target.value);
                        newConfig.blue[idx].points = parseInt(e.target.value);
                        setButtonConfig(newConfig);
                      }}
                      className="px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="Points"
                    />
                  </div>
                ))}
              </div>
            </div>
            
            <button
              onClick={() => setCurrentView('lobby')}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 mt-6"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Match View
  return (
    <div className="min-h-screen bg-gray-900 text-white p-2">
      {matchEnded && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white text-black rounded-xl p-8 text-center max-w-sm w-full">
            <h2 className="text-2xl font-bold mb-4">Match Ended!</h2>
            <div className={`text-4xl font-bold mb-4 ${winner === 'red' ? 'text-red-500' : winner === 'blue' ? 'text-blue-500' : 'text-gray-500'}`}>
              {winner === 'tie' ? 'TIE' : `${winner.toUpperCase()} WINS!`}
            </div>
            {user.role === 'Head of Court' && (
              <button
                onClick={resetMatch}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
              >
                New Match
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Header */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <div className="text-sm">Match: {matchId}</div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <Users size={16} className="mr-1" />
              <span className="text-sm">{matchUsers.length}</span>
            </div>
            <div className="flex items-center">
              {isConnected ? (
                <><Wifi className="w-4 h-4 text-green-500 mr-1" /><span className="text-green-400 text-xs">Live</span></>
              ) : (
                <><WifiOff className="w-4 h-4 text-red-500 mr-1" /><span className="text-red-400 text-xs">Offline</span></>
              )}
            </div>
          </div>
        </div>
        
        <div className="text-center">
          <div className="text-3xl font-bold mb-1">{formatTime(timeLeft)}</div>
          <div className="text-sm">Round {currentRound} of 3</div>
        </div>
        
        <div className="flex justify-center space-x-2 mt-2">
          {user.role === 'Head of Court' && (
            <>
              <button
                onClick={toggleTimer}
                className={`px-4 py-2 rounded-lg flex items-center ${isTimerRunning ? 'bg-red-600' : 'bg-green-600'}`}
              >
                {isTimerRunning ? <Pause size={16} className="mr-1" /> : <Play size={16} className="mr-1" />}
                {isTimerRunning ? 'Pause' : 'Start'}
              </button>
              <button
                onClick={resetMatch}
                className="px-4 py-2 bg-gray-600 rounded-lg flex items-center"
              >
                <RotateCcw size={16} className="mr-1" />
                Reset
              </button>
            </>
          )}
        </div>
      </div>

      {/* Connected Users */}
      <div className="mb-4 p-2 bg-gray-800 rounded-lg">
        <div className="text-xs text-gray-400 mb-1">Connected Officials:</div>
        <div className="flex flex-wrap gap-2">
          {matchUsers.map(u => (
            <div key={u.id} className={`text-xs px-2 py-1 rounded ${u.role === 'Head of Court' ? 'bg-yellow-600' : 'bg-blue-600'}`}>
              {u.role === 'Head of Court' ? <Crown className="w-3 h-3 inline mr-1" /> : <User className="w-3 h-3 inline mr-1" />}
              {u.name}
            </div>
          ))}
        </div>
      </div>

      {/* Scores */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-red-600 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold mb-1">RED</div>
          <div className="text-4xl font-bold">{scores.red}</div>
          <div className="text-sm">Rounds: {roundsWon.red}</div>
          <div className="text-sm">Penalties: {penalties.red}</div>
        </div>
        <div className="bg-blue-600 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold mb-1">BLUE</div>
          <div className="text-4xl font-bold">{scores.blue}</div>
          <div className="text-sm">Rounds: {roundsWon.blue}</div>
          <div className="text-sm">Penalties: {penalties.blue}</div>
        </div>
      </div>

      {/* Scoring Buttons */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="space-y-2">
          <div className="text-center font-bold text-red-400">RED SCORING</div>
          {buttonConfig.red.map((btn, idx) => (
            <button
              key={idx}
              onClick={() => handleScore('red', idx)}
              className={`w-full py-3 rounded-lg font-medium transition-all ${
                pendingScores[`red-${idx}`] ? 'bg-red-300 text-red-900' : 'bg-red-500 hover:bg-red-400'
              }`}
            >
              {btn.label} ({btn.points}pt)
            </button>
          ))}
        </div>
        
        <div className="space-y-2">
          <div className="text-center font-bold text-blue-400">BLUE SCORING</div>
          {buttonConfig.blue.map((btn, idx) => (
            <button
              key={idx}
              onClick={() => handleScore('blue', idx)}
              className={`w-full py-3 rounded-lg font-medium transition-all ${
                pendingScores[`blue-${idx}`] ? 'bg-blue-300 text-blue-900' : 'bg-blue-500 hover:bg-blue-400'
              }`}
            >
              {btn.label} ({btn.points}pt)
            </button>
          ))}
        </div>
      </div>

      {/* Penalty Buttons (Head of Court only) */}
      {user.role === 'Head of Court' && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handlePenalty('red')}
            className="bg-yellow-600 hover:bg-yellow-500 py-3 rounded-lg font-medium flex items-center justify-center"
          >
            <AlertTriangle size={16} className="mr-1" />
            RED Penalty
          </button>
          <button
            onClick={() => handlePenalty('blue')}
            className="bg-yellow-600 hover:bg-yellow-500 py-3 rounded-lg font-medium flex items-center justify-center"
          >
            <AlertTriangle size={16} className="mr-1" />
            BLUE Penalty
          </button>
        </div>
      )}
    </div>
  );
};

export default TaekwondoScoringApp;
