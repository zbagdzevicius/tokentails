#![cfg(test)]
use super::*;
use soroban_sdk::{symbol_short, testutils::Address as _, vec, Address, Env};

#[test]
fn test_initialize_and_mint() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let base_uri = symbol_short!("cat_base");

    let client = CatContractClient::new(&env, &env.register_contract(None, CatContract));

    // Initialize the contract
    client.initialize(&admin, &vec![&env, minter.clone()], &base_uri);

    // Mint an NFT
    let token_id = symbol_short!("cat_1");
    client.mint(&minter, &minter, &token_id);

    // Verify the owner
    let owner = client.get_owner(&token_id);
    assert_eq!(owner, minter);
}
#[test]
fn test_initialize_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let base_uri = symbol_short!("cat_base");

    let client = CatContractClient::new(&env, &env.register_contract(None, CatContract));

    // Initialize the contract
    client.initialize(&admin, &vec![&env, minter.clone()], &base_uri);
    
    assert!(client.try_initialize(&admin, &vec![&env, minter.clone()], &base_uri).is_err());
}

#[test]
fn test_unauthorized_mint() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let random_user = Address::generate(&env);
    let base_uri = symbol_short!("cat_base");

    let client = CatContractClient::new(&env, &env.register_contract(None, CatContract));

    // Initialize the contract
    client.initialize(&admin, &vec![&env, minter], &base_uri);

    // Attempt to mint with unauthorized user
    let token_id = symbol_short!("cat_2");
    
    // Now we use assert!(client.try_mint(..).is_err()) to check for the error
    assert!(client.try_mint(&random_user, &random_user, &token_id).is_err());
}

#[test]
fn test_mint() {
    let env = Env::default();
    env.mock_all_auths();
    let admin: Address = Address::generate(&env);
    let minter = Address::generate(&env);
    let base_uri = symbol_short!("cat_base");

    let client = CatContractClient::new(&env, &env.register_contract(None, CatContract));

    // Initialize the contract
    client.initialize(&admin, &vec![&env, minter.clone()], &base_uri);

    // Attempt to mint with unauthorized user
    let token_id = symbol_short!("cat_2");
    
    // Now we use assert!(client.try_mint(..).is_err()) to check for the error
    assert!(client.try_mint(&minter, &minter, &token_id).is_ok());
}

#[test]
fn test_mint_existance() {
    let env = Env::default();
    env.mock_all_auths();
    let admin: Address = Address::generate(&env);
    let minter = Address::generate(&env);
    let base_uri = symbol_short!("cat_base");

    let client = CatContractClient::new(&env, &env.register_contract(None, CatContract));

    // Initialize the contract
    client.initialize(&admin, &vec![&env, minter.clone()], &base_uri);

    // Attempt to mint with unauthorized user
    let token_id = symbol_short!("cat_2");
    
    // Now we use assert!(client.try_mint(..).is_err()) to check for the error
    client.mint(&minter, &minter, &token_id);

    assert!(client.try_get_owner(&token_id).is_ok());

    client.burn(&minter, &token_id);

    assert!(client.try_get_owner(&token_id).is_err());
}

#[test]
fn test_add_and_remove_minter() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let new_minter = Address::generate(&env);
    let base_uri = symbol_short!("cat_base");

    let client = CatContractClient::new(&env, &env.register_contract(None, CatContract));

    // Initialize the contract
    client.initialize(&admin, &vec![&env, minter.clone()], &base_uri);

    // Admin adds a new minter
    client.add_minter(&admin, &new_minter);

    // New minter should be able to mint
    let token_id = symbol_short!("cat_3");
    assert!(client.try_mint(&new_minter, &new_minter, &token_id).is_ok());
    let owner = client.get_owner(&token_id);
    assert_eq!(owner, new_minter);

    // Remove the new minter
    client.remove_minter(&admin, &new_minter);

    // New minter should no longer be able to mint
    let token_id_2 = symbol_short!("cat_4");
    
    // Use assert!(client.try_mint(..).is_err()) to check for the error
    assert!(client.try_mint(&new_minter, &new_minter, &token_id_2).is_err());
}

#[test]
fn test_add_minter_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let new_minter = Address::generate(&env);
    let base_uri = symbol_short!("cat_base");

    let client = CatContractClient::new(&env, &env.register_contract(None, CatContract));

    // Initialize the contract
    client.initialize(&admin, &vec![&env, minter.clone()], &base_uri);

    // Admin adds a new minter
    assert!(client.try_add_minter(&minter, &new_minter).is_err());
}

#[test]
fn test_remove_minter_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let new_minter = Address::generate(&env);
    let base_uri = symbol_short!("cat_base");

    let client = CatContractClient::new(&env, &env.register_contract(None, CatContract));

    // Initialize the contract
    client.initialize(&admin, &vec![&env, minter.clone()], &base_uri);

    // Admin adds a new minter
    assert!(client.try_add_minter(&admin, &new_minter).is_ok());

    // Admin adds a new minter
    assert!(client.try_remove_minter(&new_minter, &new_minter).is_err());
}

#[test]
fn test_burn() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let base_uri = symbol_short!("cat_base");

    let client = CatContractClient::new(&env, &env.register_contract(None, CatContract));

    // Initialize the contract
    client.initialize(&admin, &vec![&env, minter.clone()], &base_uri);

    // Mint an NFT
    let token_id = symbol_short!("cat_5");
    client.mint(&minter, &minter, &token_id);

    // Burn the NFT
    client.burn(&minter, &token_id);

    // Verify that the token is burned
    assert!(client.try_get_owner(&token_id).is_err());
}

#[test]
fn test_burn_unauthorized() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let base_uri = symbol_short!("cat_base");

    let client = CatContractClient::new(&env, &env.register_contract(None, CatContract));

    // Initialize the contract
    client.initialize(&admin, &vec![&env, minter.clone()], &base_uri);

    // Mint an NFT
    let token_id = symbol_short!("cat_5");
    assert!(client.try_mint(&minter, &minter, &token_id).is_err());
}

#[test]
fn test_burn_no_role() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let unauthorized_minter = Address::generate(&env);
    let base_uri = symbol_short!("cat_base");

    let client = CatContractClient::new(&env, &env.register_contract(None, CatContract));

    // Initialize the contract
    client.initialize(&admin, &vec![&env, minter.clone()], &base_uri);

    // Mint an NFT
    let token_id = symbol_short!("cat_5");
    assert!(client.try_mint(&unauthorized_minter, &minter, &token_id).is_err());
}

#[test]
fn test_set_and_get_base_uri() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let base_uri = symbol_short!("cat_base");

    let client = CatContractClient::new(&env, &env.register_contract(None, CatContract));

    // Initialize the contract
    client.initialize(&admin, &vec![&env, minter], &base_uri);

    // Verify base URI is set correctly
    assert_eq!(client.get_base_uri(), base_uri);

    // Change the base URI
    let new_base_uri = symbol_short!("new_cat_b");
    client.set_base_uri(&admin, &new_base_uri);

    // Verify the updated base URI
    assert_eq!(client.get_base_uri(), new_base_uri);
}