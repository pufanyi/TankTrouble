use serde::{Deserialize, Serialize};
use crate::physics::{GameEvent, GameSnapshot, PlayerId, TankInput};
use crate::map::GameMap;

/// Messages sent from client to server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ClientMessage {
    /// Join the game.
    Join { name: String },
    /// Player input for this tick.
    Input(TankInput),
    /// Ping for latency measurement.
    Ping { timestamp: u64 },
}

/// Messages sent from server to client.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ServerMessage {
    /// Welcome message with assigned player ID and map.
    Welcome { player_id: PlayerId, map: GameMap },
    /// Full game state snapshot (sent periodically).
    Snapshot(GameSnapshot),
    /// Game events (sent every tick).
    Events(Vec<GameEvent>),
    /// Pong response.
    Pong { timestamp: u64 },
    /// Player joined/left notifications.
    PlayerJoined { id: PlayerId, name: String },
    PlayerLeft { id: PlayerId },
    /// Round over.
    RoundOver { winner: Option<PlayerId> },
}
