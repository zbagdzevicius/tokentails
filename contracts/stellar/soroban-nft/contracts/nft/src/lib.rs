#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, vec, Address, Env, Error as SdkError,
    String, Symbol, Vec,
};

#[contract]
pub struct NFTContract;

#[derive(Clone, Debug, PartialEq)]
#[repr(u32)]
pub enum Error {
    Unauthorized = 1,
    MinterNotFound = 2,
    TokenExists = 3,
    TokenNotFound = 4,
}

impl From<Error> for SdkError {
    fn from(err: Error) -> SdkError {
        SdkError::from_contract_error(err as u32)
    }
}

#[contracttype]
pub struct Roles {
    pub admin: Address,
}

const ROLES: Symbol = symbol_short!("ROLES");
const BASE_URI: Symbol = symbol_short!("BASE_URI");

#[contractimpl]
impl NFTContract {
    // Initialize contract with admin and minter roles in persistent storage
    pub fn initialize(env: Env, admin: Address, base_uri: String) -> Result<(), SdkError> {
        // Check if the contract has already been initialized by checking the presence of the ROLES key
        if env.storage().persistent().has(&ROLES) {
            return Err(Error::Unauthorized.into());
        }
        let roles = Roles {
            admin: admin.clone(),
        };
        env.storage().persistent().set(&ROLES, &roles);
        env.storage().persistent().set(&BASE_URI, &base_uri);

        Ok(())
    }

    // Mint an NFT to a specific address with auto-generated token ID
    pub fn mint(env: Env, to: Address) -> Result<(), SdkError> {
        let token_id = to.to_string();

        // Log the token_id for debugging purposes
        env.storage().persistent().set(&token_id, &to.clone());

        Ok(())
    }

    pub fn check() -> Result<(), SdkError> {
        Ok(())
    }

    // Get the owner of an NFT from persistent storage
    pub fn owner_of(env: Env, token_id: String) -> Result<Address, SdkError> {
        // Check if the token exists in persistent storage
        if !env.storage().persistent().has(&token_id) {
            return Err(Error::TokenNotFound.into());
        }
        let owner = env.storage().persistent().get(&token_id).unwrap();
        Ok(owner)
    }

    // Set the base URI for the metadata in persistent storage
    pub fn set_base_uri(env: Env, invoker: Address, new_base_uri: String) -> Result<(), SdkError> {
        let roles: Roles = env.storage().persistent().get(&ROLES).unwrap();

        // Require that the invoker (caller) has authorized this call
        invoker.require_auth();

        // Only admin can set the base URI
        if invoker != roles.admin {
            return Err(Error::Unauthorized.into());
        }

        env.storage().persistent().set(&BASE_URI, &new_base_uri);
        Ok(())
    }

    // Get the base URI for the NFTs from persistent storage
    pub fn get_base_uri(env: Env) -> String {
        env.storage().persistent().get(&BASE_URI).unwrap()
    }

    // Get the token URI by concatenating base URI and token ID
    pub fn get_token_uri(env: Env, token_id: String) -> Result<Vec<String>, SdkError> {
        // Check if the token exists in persistent storage
        if !env.storage().persistent().has(&token_id) {
            return Err(Error::TokenNotFound.into());
        }
        let base_uri: String = Self::get_base_uri(env.clone());

        Ok(vec![&env, base_uri, token_id])
    }
}

mod test;
