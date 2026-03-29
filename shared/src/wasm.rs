use wasm_bindgen::prelude::*;
use std::collections::HashMap;
use crate::physics::{PhysicsWorld, TankInput, PlayerId};
use crate::map::GameMap;

/// WASM wrapper for client-side physics prediction.
#[wasm_bindgen]
pub struct WasmPhysicsWorld {
    world: PhysicsWorld,
}

#[wasm_bindgen]
impl WasmPhysicsWorld {
    #[wasm_bindgen(constructor)]
    pub fn new(map_json: &str) -> Result<WasmPhysicsWorld, JsValue> {
        console_error_panic_hook::set_once();
        let map: GameMap = serde_json::from_str(map_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse map: {e}")))?;
        Ok(WasmPhysicsWorld {
            world: PhysicsWorld::new(map),
        })
    }

    pub fn add_tank(&mut self, id: PlayerId) {
        self.world.add_tank(id);
    }

    pub fn step(&mut self, inputs_json: &str) -> Result<String, JsValue> {
        let inputs: HashMap<PlayerId, TankInput> = serde_json::from_str(inputs_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse inputs: {e}")))?;
        let events = self.world.step(&inputs);
        self.world.cleanup_removed_bullets();
        serde_json::to_string(&events)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize events: {e}")))
    }

    pub fn snapshot(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.world.snapshot())
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize snapshot: {e}")))
    }
}
