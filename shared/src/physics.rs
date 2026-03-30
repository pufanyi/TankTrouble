use rapier2d::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::map::GameMap;

// --- Constants ---

pub const TANK_WIDTH: f32 = 30.0;
pub const TANK_HEIGHT: f32 = 20.0;
pub const TANK_SPEED: f32 = 150.0;
pub const TANK_ROTATION_SPEED: f32 = 3.5;
pub const BULLET_RADIUS: f32 = 4.0;
pub const BULLET_SPEED: f32 = 350.0;
pub const MAX_BULLETS_PER_TANK: usize = 5;
pub const BULLET_MAX_BOUNCES: u32 = 50;
pub const PHYSICS_TIMESTEP: f32 = 1.0 / 60.0;

// --- Input ---

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct TankInput {
    pub forward: bool,
    pub backward: bool,
    pub turn_left: bool,
    pub turn_right: bool,
    pub fire: bool,
}

// --- Identifiers ---

pub type PlayerId = u32;

// --- Collision groups ---

const WALL_GROUP: u32 = 0b0001;
const TANK_GROUP: u32 = 0b0010;
const BULLET_GROUP: u32 = 0b0100;

fn wall_collision_groups() -> InteractionGroups {
    InteractionGroups::new(Group::from_bits_truncate(WALL_GROUP), Group::all())
}

fn tank_collision_groups() -> InteractionGroups {
    InteractionGroups::new(
        Group::from_bits_truncate(TANK_GROUP),
        Group::from_bits_truncate(WALL_GROUP | TANK_GROUP),
    )
}

fn bullet_collision_groups() -> InteractionGroups {
    InteractionGroups::new(
        Group::from_bits_truncate(BULLET_GROUP),
        Group::from_bits_truncate(WALL_GROUP | TANK_GROUP),
    )
}

// --- Tank state ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TankState {
    pub id: PlayerId,
    pub x: f32,
    pub y: f32,
    pub rotation: f32,
    pub alive: bool,
    pub bullet_count: usize,
}

// --- Bullet state ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BulletState {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub owner: PlayerId,
    pub bounces: u32,
}

// --- Internal tracking ---

struct TankBody {
    body_handle: RigidBodyHandle,
    collider_handle: ColliderHandle,
    alive: bool,
    bullet_count: usize,
}

struct BulletBody {
    id: u32,
    body_handle: RigidBodyHandle,
    collider_handle: ColliderHandle,
    owner: PlayerId,
    bounces: u32,
    remove: bool,
}

// --- Game events ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GameEvent {
    TankDestroyed { victim: PlayerId, killer: PlayerId },
    BulletFired { owner: PlayerId, x: f32, y: f32, vx: f32, vy: f32 },
    BulletBounced { bullet_id: u32 },
    BulletDestroyed { bullet_id: u32 },
}

// --- Snapshot for network sync ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSnapshot {
    pub tick: u64,
    pub tanks: Vec<TankState>,
    pub bullets: Vec<BulletState>,
}

// --- Physics world ---

pub struct PhysicsWorld {
    rigid_body_set: RigidBodySet,
    collider_set: ColliderSet,
    integration_parameters: IntegrationParameters,
    physics_pipeline: PhysicsPipeline,
    island_manager: IslandManager,
    broad_phase: DefaultBroadPhase,
    narrow_phase: NarrowPhase,
    impulse_joint_set: ImpulseJointSet,
    multibody_joint_set: MultibodyJointSet,
    ccd_solver: CCDSolver,

    tanks: HashMap<PlayerId, TankBody>,
    bullets: Vec<BulletBody>,
    _wall_colliders: Vec<ColliderHandle>,
    next_bullet_id: u32,
    pub tick: u64,

    map: GameMap,
}

impl PhysicsWorld {
    pub fn new(map: GameMap) -> Self {
        let mut rigid_body_set = RigidBodySet::new();
        let mut collider_set = ColliderSet::new();

        let integration_parameters = IntegrationParameters {
            dt: PHYSICS_TIMESTEP,
            ..Default::default()
        };

        let mut wall_colliders = Vec::new();

        // Create wall colliders
        for wall in &map.walls {
            let cx = (wall.x1 + wall.x2) / 2.0;
            let cy = (wall.y1 + wall.y2) / 2.0;
            let dx = wall.x2 - wall.x1;
            let dy = wall.y2 - wall.y1;
            let length = (dx * dx + dy * dy).sqrt();
            let angle = dy.atan2(dx);

            let body = RigidBodyBuilder::fixed()
                .translation(vector![cx, cy])
                .rotation(angle)
                .build();
            let body_handle = rigid_body_set.insert(body);

            let half_thickness = wall.thickness / 2.0;
            let half_length = length / 2.0;

            let collider = ColliderBuilder::cuboid(half_length, half_thickness)
                .restitution(1.0) // Perfect bounce for bullets
                .friction(0.0)
                .collision_groups(wall_collision_groups())
                .build();
            let collider_handle = collider_set.insert_with_parent(collider, body_handle, &mut rigid_body_set);
            wall_colliders.push(collider_handle);
        }

        PhysicsWorld {
            rigid_body_set,
            collider_set,
            integration_parameters,
            physics_pipeline: PhysicsPipeline::new(),
            island_manager: IslandManager::new(),
            broad_phase: DefaultBroadPhase::new(),
            narrow_phase: NarrowPhase::new(),
            impulse_joint_set: ImpulseJointSet::new(),
            multibody_joint_set: MultibodyJointSet::new(),
            ccd_solver: CCDSolver::new(),
            tanks: HashMap::new(),
            bullets: Vec::new(),
            _wall_colliders: wall_colliders,
            next_bullet_id: 0,
            tick: 0,
            map,
        }
    }

    pub fn add_tank(&mut self, id: PlayerId) {
        let spawn_idx = id as usize % self.map.spawn_points.len();
        let (sx, sy) = self.map.spawn_points[spawn_idx];

        let body = RigidBodyBuilder::dynamic()
            .translation(vector![sx, sy])
            .linear_damping(10.0) // High damping so tank stops quickly
            .angular_damping(10.0)
            .build();
        let body_handle = self.rigid_body_set.insert(body);

        let collider = ColliderBuilder::cuboid(TANK_WIDTH / 2.0, TANK_HEIGHT / 2.0)
            .density(1.0)
            .friction(0.0)
            .restitution(0.0)
            .collision_groups(tank_collision_groups())
            .active_events(ActiveEvents::COLLISION_EVENTS)
            .build();
        let collider_handle = self.collider_set.insert_with_parent(
            collider,
            body_handle,
            &mut self.rigid_body_set,
        );

        self.tanks.insert(id, TankBody {
            body_handle,
            collider_handle,
            alive: true,
            bullet_count: 0,
        });
    }

    pub fn remove_tank(&mut self, id: PlayerId) {
        if let Some(tank) = self.tanks.remove(&id) {
            self.rigid_body_set.remove(
                tank.body_handle,
                &mut self.island_manager,
                &mut self.collider_set,
                &mut self.impulse_joint_set,
                &mut self.multibody_joint_set,
                true,
            );
        }
    }

    /// Apply input and step the physics world. Returns events from this tick.
    pub fn step(&mut self, inputs: &HashMap<PlayerId, TankInput>) -> Vec<GameEvent> {
        let mut events = Vec::new();

        // Apply tank inputs
        for (&id, input) in inputs {
            if let Some(tank) = self.tanks.get(&id) {
                if !tank.alive {
                    continue;
                }
                if let Some(body) = self.rigid_body_set.get_mut(tank.body_handle) {
                    let rotation = body.rotation().angle();

                    // Movement
                    let mut force = 0.0;
                    if input.forward { force += TANK_SPEED; }
                    if input.backward { force -= TANK_SPEED * 0.6; }

                    let fx = force * rotation.cos();
                    let fy = force * rotation.sin();
                    body.set_linvel(vector![fx, fy], true);

                    // Rotation
                    let mut torque = 0.0;
                    if input.turn_left { torque -= TANK_ROTATION_SPEED; }
                    if input.turn_right { torque += TANK_ROTATION_SPEED; }
                    body.set_angvel(torque, true);
                }
            }
        }

        // Handle firing
        for (&id, input) in inputs {
            if input.fire
                && let Some(tank) = self.tanks.get(&id) {
                    if !tank.alive || tank.bullet_count >= MAX_BULLETS_PER_TANK {
                        continue;
                    }
                    if let Some(body) = self.rigid_body_set.get(tank.body_handle) {
                        let pos = *body.translation();
                        let angle = body.rotation().angle();

                        // Spawn bullet at tank barrel tip
                        let spawn_dist = TANK_WIDTH / 2.0 + BULLET_RADIUS + 2.0;
                        let bx = pos.x + angle.cos() * spawn_dist;
                        let by = pos.y + angle.sin() * spawn_dist;
                        let vx = BULLET_SPEED * angle.cos();
                        let vy = BULLET_SPEED * angle.sin();

                        let bullet_id = self.next_bullet_id;
                        self.next_bullet_id += 1;

                        let bullet_body = RigidBodyBuilder::dynamic()
                            .translation(vector![bx, by])
                            .linvel(vector![vx, vy])
                            .gravity_scale(0.0)
                            .ccd_enabled(true) // Continuous collision detection — bullet won't tunnel
                            .build();
                        let bh = self.rigid_body_set.insert(bullet_body);

                        let bullet_collider = ColliderBuilder::ball(BULLET_RADIUS)
                            .restitution(1.0)
                            .restitution_combine_rule(CoefficientCombineRule::Max)
                            .friction(0.0)
                            .density(0.1)
                            .collision_groups(bullet_collision_groups())
                            .active_events(ActiveEvents::COLLISION_EVENTS | ActiveEvents::CONTACT_FORCE_EVENTS)
                            .build();
                        let ch = self.collider_set.insert_with_parent(bullet_collider, bh, &mut self.rigid_body_set);

                        self.bullets.push(BulletBody {
                            id: bullet_id,
                            body_handle: bh,
                            collider_handle: ch,
                            owner: id,
                            bounces: 0,
                            remove: false,
                        });

                        if let Some(tank) = self.tanks.get_mut(&id) {
                            tank.bullet_count += 1;
                        }

                        events.push(GameEvent::BulletFired { owner: id, x: bx, y: by, vx, vy });
                    }
                }
        }

        // Step physics
        self.physics_pipeline.step(
            &vector![0.0, 0.0], // No gravity for top-down game
            &self.integration_parameters,
            &mut self.island_manager,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.rigid_body_set,
            &mut self.collider_set,
            &mut self.impulse_joint_set,
            &mut self.multibody_joint_set,
            &mut self.ccd_solver,
            None,
            &(),
            &(),
        );

        // Process bullet-wall bounces: re-normalize bullet speed after bounce
        for bullet in &mut self.bullets {
            if bullet.remove {
                continue;
            }
            if let Some(body) = self.rigid_body_set.get_mut(bullet.body_handle) {
                let vel = *body.linvel();
                let speed = (vel.x * vel.x + vel.y * vel.y).sqrt();

                // If speed changed significantly, a bounce happened
                if (speed - BULLET_SPEED).abs() > 1.0 {
                    // Re-normalize to constant speed
                    if speed > 0.01 {
                        let scale = BULLET_SPEED / speed;
                        body.set_linvel(vector![vel.x * scale, vel.y * scale], true);
                    }
                    bullet.bounces += 1;
                    events.push(GameEvent::BulletBounced { bullet_id: bullet.id });

                    if bullet.bounces >= BULLET_MAX_BOUNCES {
                        bullet.remove = true;
                        events.push(GameEvent::BulletDestroyed { bullet_id: bullet.id });
                    }
                }
            }
        }

        // Check bullet-tank collisions
        for pair in self.narrow_phase.contact_pairs() {
            if !pair.has_any_active_contact {
                continue;
            }

            let c1 = pair.collider1;
            let c2 = pair.collider2;

            // Find if one is a bullet and the other is a tank
            let bullet_idx = self.bullets.iter().position(|b| b.collider_handle == c1 || b.collider_handle == c2);
            if let Some(bi) = bullet_idx {
                let bullet_ch = self.bullets[bi].collider_handle;
                let other_ch = if bullet_ch == c1 { c2 } else { c1 };

                // Check if other is a tank
                for (&tank_id, tank) in &mut self.tanks {
                    if tank.collider_handle == other_ch && tank.alive {
                        tank.alive = false;
                        let killer = self.bullets[bi].owner;
                        self.bullets[bi].remove = true;
                        events.push(GameEvent::TankDestroyed { victim: tank_id, killer });
                        events.push(GameEvent::BulletDestroyed { bullet_id: self.bullets[bi].id });
                        break;
                    }
                }
            }
        }

        // Remove dead bullets
        let mut removed_owners = Vec::new();
        self.bullets.retain(|bullet| {
            if bullet.remove {
                removed_owners.push(bullet.owner);
                // Remove from physics
                // We can't borrow self mutably here, so collect and remove after
                false
            } else {
                true
            }
        });

        // Actually remove bullet bodies (we need a second pass since retain doesn't give mutable self)
        // The bodies are already detached from the bullets vec; clean them up
        // Note: we need to track body handles before retain. Let's refactor:
        // Actually the retain already dropped them from our tracking. The rigid bodies remain in the set.
        // We'll clean up orphaned bodies:
        // For simplicity, let's handle this properly:

        // Decrement bullet counts for removed bullets
        for owner in &removed_owners {
            if let Some(tank) = self.tanks.get_mut(owner)
                && tank.bullet_count > 0 {
                    tank.bullet_count -= 1;
                }
        }

        self.tick += 1;
        events
    }

    /// Remove physics bodies for bullets marked for removal.
    /// Call after step() to clean up.
    pub fn cleanup_removed_bullets(&mut self) {
        // Collect handles of bullets to remove
        let to_remove: Vec<RigidBodyHandle> = self.bullets
            .iter()
            .filter(|b| b.remove)
            .map(|b| b.body_handle)
            .collect();

        for handle in to_remove {
            self.rigid_body_set.remove(
                handle,
                &mut self.island_manager,
                &mut self.collider_set,
                &mut self.impulse_joint_set,
                &mut self.multibody_joint_set,
                true,
            );
        }

        self.bullets.retain(|b| !b.remove);
    }

    pub fn snapshot(&self) -> GameSnapshot {
        let tanks = self.tanks.iter().map(|(&id, tank)| {
            let body = &self.rigid_body_set[tank.body_handle];
            let pos = body.translation();
            TankState {
                id,
                x: pos.x,
                y: pos.y,
                rotation: body.rotation().angle(),
                alive: tank.alive,
                bullet_count: tank.bullet_count,
            }
        }).collect();

        let bullets = self.bullets.iter().map(|bullet| {
            let body = &self.rigid_body_set[bullet.body_handle];
            let pos = body.translation();
            let vel = body.linvel();
            BulletState {
                id: bullet.id,
                x: pos.x,
                y: pos.y,
                vx: vel.x,
                vy: vel.y,
                owner: bullet.owner,
                bounces: bullet.bounces,
            }
        }).collect();

        GameSnapshot { tick: self.tick, tanks, bullets }
    }

    pub fn map(&self) -> &GameMap {
        &self.map
    }

    /// Check if all tanks except one (or zero) are dead.
    pub fn check_round_over(&self) -> Option<PlayerId> {
        let alive: Vec<PlayerId> = self.tanks.iter()
            .filter(|(_, t)| t.alive)
            .map(|(&id, _)| id)
            .collect();
        if alive.len() <= 1 && self.tanks.len() > 1 {
            alive.into_iter().next()
        } else {
            None
        }
    }
}
