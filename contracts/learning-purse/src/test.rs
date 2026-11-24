extern crate std;

use super::*;
use soroban_sdk::testutils::{Address as _, MockAuth, MockAuthInvoke};
use soroban_sdk::{token::StellarAssetClient, IntoVal};

const USDC: i128 = 10_000_000; // 7 decimals

struct Setup {
    env: Env,
    owner: Address,
    agent: Address,
    token: Address,
    purse: Address,
}

fn setup(per_class: i128, budget: i128, approval_above: i128, funded: i128) -> Setup {
    let env = Env::default();
    let owner = Address::generate(&env);
    let agent = Address::generate(&env);
    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();
    let limits = Limits { per_class_max: per_class * USDC, total_budget: budget * USDC, approval_above: approval_above * USDC };
    let purse = env.register(LearningPurse, (owner.clone(), agent.clone(), token.clone(), limits));
    env.mock_all_auths();
    StellarAssetClient::new(&env, &token).mint(&purse, &(funded * USDC));
    env.set_auths(&[]);
    Setup { env, owner, agent, token, purse }
}

/// Release signed by the agent only (no owner signature).
fn agent_release(s: &Setup, course: &String, amount: i128) -> Result<Result<i128, soroban_sdk::Error>, Result<Error, soroban_sdk::InvokeError>> {
    let invoke = MockAuthInvoke { contract: &s.purse, fn_name: "release", args: (course.clone(), amount).into_val(&s.env), sub_invokes: &[] };
    LearningPurseClient::new(&s.env, &s.purse).mock_auths(&[MockAuth { address: &s.agent, invoke: &invoke }]).try_release(course, &amount)
}

#[test]
fn agent_releases_within_limits_and_wallet_gets_exact_amount() {
    let s = setup(5, 6, 3, 10);
    let client = LearningPurseClient::new(&s.env, &s.purse);
    let course = String::from_str(&s.env, "yoruba-for-kids");
    let spent = agent_release(&s, &course, 2 * USDC).unwrap().unwrap();
    assert_eq!(spent, 2 * USDC);
    assert_eq!(token::Client::new(&s.env, &s.token).balance(&s.agent), 2 * USDC);
    assert_eq!(client.balance(), 8 * USDC);
    assert_eq!(client.released(&course), 2 * USDC);
}

#[test]
fn per_class_limit_budget_and_double_pay_are_rejected() {
    let s = setup(5, 6, 10, 20);
    let big = String::from_str(&s.env, "big");
    assert_eq!(agent_release(&s, &big, 6 * USDC), Err(Ok(Error::OverClassLimit)));
    let a = String::from_str(&s.env, "a");
    agent_release(&s, &a, 4 * USDC).unwrap().unwrap();
    assert_eq!(agent_release(&s, &a, 1 * USDC), Err(Ok(Error::AlreadyReleased)));
    let b = String::from_str(&s.env, "b");
    assert_eq!(agent_release(&s, &b, 3 * USDC), Err(Ok(Error::OverBudget)));
    assert_eq!(agent_release(&s, &b, 0), Err(Ok(Error::InvalidAmount)));
}

#[test]
#[should_panic]
fn above_threshold_without_owner_signature_fails() {
    let s = setup(5, 10, 3, 10);
    let course = String::from_str(&s.env, "crafts");
    agent_release(&s, &course, 4 * USDC).unwrap().unwrap();
}

#[test]
fn above_threshold_with_owner_signature_succeeds() {
    let s = setup(5, 10, 3, 10);
    let client = LearningPurseClient::new(&s.env, &s.purse);
    let course = String::from_str(&s.env, "crafts");
    let args = (course.clone(), 4 * USDC).into_val(&s.env);
    let invoke = MockAuthInvoke { contract: &s.purse, fn_name: "release", args, sub_invokes: &[] };
    client.mock_auths(&[MockAuth { address: &s.agent, invoke: &invoke }, MockAuth { address: &s.owner, invoke: &invoke }]).release(&course, &(4 * USDC));
    assert_eq!(client.state().spent, 4 * USDC);
}

#[test]
#[should_panic]
fn agent_cannot_change_limits() {
    let s = setup(5, 10, 3, 10);
    let client = LearningPurseClient::new(&s.env, &s.purse);
    let limits = Limits { per_class_max: 100 * USDC, total_budget: 100 * USDC, approval_above: 100 * USDC };
    let invoke = MockAuthInvoke { contract: &s.purse, fn_name: "set_limits", args: (limits.clone(),).into_val(&s.env), sub_invokes: &[] };
    client.mock_auths(&[MockAuth { address: &s.agent, invoke: &invoke }]).set_limits(&limits);
}

#[test]
fn owner_pauses_changes_limits_and_withdraws() {
    let s = setup(5, 10, 3, 10);
    s.env.mock_all_auths();
    let client = LearningPurseClient::new(&s.env, &s.purse);
    client.set_paused(&true);
    let course = String::from_str(&s.env, "x");
    assert_eq!(client.try_release(&course, &USDC), Err(Ok(Error::Paused)));
    client.set_paused(&false);
    assert_eq!(client.try_set_limits(&Limits { per_class_max: 20 * USDC, total_budget: 10 * USDC, approval_above: 0 }), Err(Ok(Error::InvalidLimits)));
    client.set_limits(&Limits { per_class_max: 2 * USDC, total_budget: 4 * USDC, approval_above: 2 * USDC });
    assert_eq!(client.try_release(&course, &(3 * USDC)), Err(Ok(Error::OverClassLimit)));
    client.withdraw(&s.owner, &(7 * USDC));
    assert_eq!(client.balance(), 3 * USDC);
    assert_eq!(token::Client::new(&s.env, &s.token).balance(&s.owner), 7 * USDC);
}
