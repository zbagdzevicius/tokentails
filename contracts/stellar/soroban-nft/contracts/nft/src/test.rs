#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn test_initialize_and_mint() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let base_uri = String::from_str(&env, "cat_base");

    let client = NFTContractClient::new(&env, &env.register_contract(None, NFTContract));

    // Initialize the contract
    client.initialize(&admin, &base_uri);

    // Mint an NFT
    client.mint(&minter);

    // Verify the owner
    let owner = client.try_owner_of(&minter.to_string());
    assert_eq!(owner.unwrap(), Ok(minter.clone()));
}

#[test]
fn test_initialize_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let base_uri = String::from_str(&env, "cat_base");

    let client = NFTContractClient::new(&env, &env.register_contract(None, NFTContract));

    // Initialize the contract
    client.initialize(&admin, &base_uri);

    assert!(client.try_initialize(&admin, &base_uri).is_err());
}

#[test]
fn test_mint() {
    let env = Env::default();
    env.mock_all_auths();
    let admin: Address = Address::generate(&env);
    let minter = Address::generate(&env);
    let base_uri = String::from_str(&env, "cat_base");

    let client = NFTContractClient::new(&env, &env.register_contract(None, NFTContract));

    // Initialize the contract
    client.initialize(&admin, &base_uri);

    // Now we use assert!(client.try_mint(..).is_err()) to check for the error
    assert!(client.try_mint(&minter).is_ok());
}

#[test]
fn test_mint_existance() {
    let env = Env::default();
    env.mock_all_auths();
    let admin: Address = Address::generate(&env);
    let minter = Address::generate(&env);
    let base_uri = String::from_str(&env, "cat_base");

    let client = NFTContractClient::new(&env, &env.register_contract(None, NFTContract));

    // Initialize the contract
    client.initialize(&admin, &base_uri);

    // Now we use assert!(client.try_mint(..).is_err()) to check for the error
    client.mint(&minter);

    assert!(client.try_owner_of(&minter.to_string()).is_ok());
}

#[test]
fn test_set_and_get_base_uri() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let base_uri = String::from_str(&env, "cat_base");

    let client = NFTContractClient::new(&env, &env.register_contract(None, NFTContract));

    // Initialize the contract
    client.initialize(&admin, &base_uri);

    // Verify base URI is set correctly
    assert_eq!(client.get_base_uri(), base_uri);

    // Change the base URI
    let new_base_uri = String::from_str(&env, "new_cat_b");
    client.set_base_uri(&admin, &new_base_uri);

    // Verify the updated base URI
    assert_eq!(client.get_base_uri(), new_base_uri);
}
