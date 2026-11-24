#![no_std]
//! LearnPurse learning purse.
//!
//! Holds a learner's USDC budget on Stellar and releases it to their AI learning agent one class at a
//! time, inside limits the owner (a parent, sponsor or the learner) sets. The AI never holds the budget:
//! the agent wallet starts each purchase with nothing, asks the purse for exactly one class price, and
//! pays the creator over x402. A stolen agent key can only take what these rules allow.
//!
//! Rules enforced on-chain for every release:
//! - at most `per_class_max` per class
//! - at most `total_budget` in total, ever
//! - each class (course id) is paid for once
//! - releases above `approval_above` also need the owner's signature
//! - the owner can pause the agent, change limits, or withdraw at any time

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, String};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    OverClassLimit = 2,
    OverBudget = 3,
    AlreadyReleased = 4,
    Paused = 5,
    InvalidLimits = 6,
    InsufficientFunds = 7,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Limits {
    pub per_class_max: i128,
    pub total_budget: i128,
    pub approval_above: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct State {
    pub owner: Address,
    pub agent: Address,
    pub token: Address,
    pub limits: Limits,
    pub spent: i128,
    pub paused: bool,
}

#[contracttype]
enum Key {
    State,
    Released(String),
}

fn check_limits(limits: &Limits) -> Result<(), Error> {
    if limits.per_class_max <= 0 || limits.total_budget <= 0 || limits.approval_above < 0 || limits.per_class_max > limits.total_budget {
        return Err(Error::InvalidLimits);
    }
    Ok(())
}

fn load(env: &Env) -> State {
    env.storage().instance().get(&Key::State).unwrap()
}

fn save(env: &Env, state: &State) {
    env.storage().instance().set(&Key::State, state);
    env.storage().instance().extend_ttl(100_000, 500_000);
}

#[contract]
pub struct LearningPurse;

#[contractimpl]
impl LearningPurse {
    /// Set up once at deploy time. Amounts are in the token's smallest unit (7 decimals for USDC).
    pub fn __constructor(env: Env, owner: Address, agent: Address, token: Address, limits: Limits) -> Result<(), Error> {
        check_limits(&limits)?;
        save(&env, &State { owner, agent, token, limits, spent: 0, paused: false });
        Ok(())
    }

    /// Release exactly one class price from the purse to the agent wallet.
    /// The agent always signs. Above `approval_above`, the owner must sign too.
    pub fn release(env: Env, course_id: String, amount: i128) -> Result<i128, Error> {
        let mut state = load(&env);
        state.agent.require_auth();
        if state.paused {
            return Err(Error::Paused);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if amount > state.limits.per_class_max {
            return Err(Error::OverClassLimit);
        }
        if state.spent + amount > state.limits.total_budget {
            return Err(Error::OverBudget);
        }
        let key = Key::Released(course_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyReleased);
        }
        if amount > state.limits.approval_above {
            state.owner.require_auth();
        }
        let token = token::Client::new(&env, &state.token);
        if token.balance(&env.current_contract_address()) < amount {
            return Err(Error::InsufficientFunds);
        }
        token.transfer(&env.current_contract_address(), &state.agent, &amount);
        state.spent += amount;
        env.storage().persistent().set(&key, &amount);
        env.storage().persistent().extend_ttl(&key, 100_000, 500_000);
        save(&env, &state);
        env.events().publish((symbol_short!("release"), course_id), (amount, state.spent));
        Ok(state.spent)
    }

    /// Owner changes the limits. Spending so far still counts against the new budget.
    pub fn set_limits(env: Env, limits: Limits) -> Result<(), Error> {
        let mut state = load(&env);
        state.owner.require_auth();
        check_limits(&limits)?;
        state.limits = limits;
        save(&env, &state);
        Ok(())
    }

    /// Owner pauses or resumes the agent.
    pub fn set_paused(env: Env, paused: bool) {
        let mut state = load(&env);
        state.owner.require_auth();
        state.paused = paused;
        save(&env, &state);
    }

    /// Owner takes funds back out of the purse.
    pub fn withdraw(env: Env, to: Address, amount: i128) -> Result<(), Error> {
        let state = load(&env);
        state.owner.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        token::Client::new(&env, &state.token).transfer(&env.current_contract_address(), &to, &amount);
        Ok(())
    }

    pub fn state(env: Env) -> State {
        load(&env)
    }

    pub fn balance(env: Env) -> i128 {
        let state = load(&env);
        token::Client::new(&env, &state.token).balance(&env.current_contract_address())
    }

    pub fn released(env: Env, course_id: String) -> i128 {
        env.storage().persistent().get(&Key::Released(course_id)).unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
