#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, BytesN, Env,
};

const MAX_INSTALLMENTS: u32 = 12;

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    CourseExists = 3,
    CourseNotFound = 4,
    CoursePaused = 5,
    InvalidPrice = 6,
    InvalidCapacity = 7,
    InvalidInstallments = 8,
    UnauthorizedRegistrar = 9,
    PaymentAlreadyRecorded = 10,
    AlreadyEntitled = 11,
    CapacityReached = 12,
    InstallmentsComplete = 13,
    InvalidPaymentNumber = 14,
    EntitlementNotFound = 15,
    InvalidStatus = 16,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PaymentMode {
    Single,
    Repeat,
    Installments,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CourseStatus {
    Published,
    Paused,
    Inactive,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Course {
    pub creator: Address,
    pub recipient: Address,
    pub asset: Address,
    pub price_units: i128,
    pub capacity: u32,
    pub enrolled: u32,
    pub payment_mode: PaymentMode,
    pub installment_count: u32,
    pub version: u32,
    pub status: CourseStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Entitlement {
    pub payments: u32,
    pub installments_paid: u32,
    pub active: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Purchase {
    pub student: Address,
    pub payment_reference: BytesN<32>,
    pub payment_number: u32,
    pub recorded_at: u64,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Registrar,
    Course(BytesN<32>),
    Entitlement(BytesN<32>, Address),
    Purchase(BytesN<32>, BytesN<32>),
}

#[contract]
pub struct CourseRegistry;

fn require_initialized(env: &Env) -> Result<(), Error> {
    if !env.storage().instance().has(&DataKey::Admin) {
        return Err(Error::NotInitialized);
    }
    Ok(())
}

fn require_registrar(env: &Env, registrar: &Address) -> Result<(), Error> {
    require_initialized(env)?;
    let configured: Address = env.storage().instance().get(&DataKey::Registrar).unwrap();
    if configured != *registrar {
        return Err(Error::UnauthorizedRegistrar);
    }
    registrar.require_auth();
    Ok(())
}

fn validate_payment(mode: PaymentMode, installments: u32) -> Result<(), Error> {
    match mode {
        PaymentMode::Installments if installments < 2 || installments > MAX_INSTALLMENTS => {
            Err(Error::InvalidInstallments)
        }
        PaymentMode::Single | PaymentMode::Repeat if installments != 0 => {
            Err(Error::InvalidInstallments)
        }
        _ => Ok(()),
    }
}

#[contractimpl]
impl CourseRegistry {
    pub fn initialize(env: Env, admin: Address, registrar: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Registrar, &registrar);
        Ok(())
    }

    pub fn set_registrar(env: Env, admin: Address, registrar: Address) -> Result<(), Error> {
        require_initialized(&env)?;
        let configured: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if configured != admin {
            return Err(Error::InvalidStatus);
        }
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::Registrar, &registrar);
        Ok(())
    }

    pub fn register_course(
        env: Env,
        course_id: BytesN<32>,
        creator: Address,
        recipient: Address,
        asset: Address,
        price_units: i128,
        capacity: u32,
        payment_mode: PaymentMode,
        installment_count: u32,
    ) -> Result<(), Error> {
        require_initialized(&env)?;
        creator.require_auth();
        if env
            .storage()
            .persistent()
            .has(&DataKey::Course(course_id.clone()))
        {
            return Err(Error::CourseExists);
        }
        if price_units <= 0 {
            return Err(Error::InvalidPrice);
        }
        if capacity == 0 {
            return Err(Error::InvalidCapacity);
        }
        validate_payment(payment_mode, installment_count)?;
        let course = Course {
            creator,
            recipient,
            asset,
            price_units,
            capacity,
            enrolled: 0,
            payment_mode,
            installment_count,
            version: 1,
            status: CourseStatus::Published,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Course(course_id.clone()), &course);
        env.events()
            .publish((symbol_short!("course"), course_id), course.version);
        Ok(())
    }

    pub fn update_course(
        env: Env,
        course_id: BytesN<32>,
        creator: Address,
        recipient: Address,
        asset: Address,
        price_units: i128,
        capacity: u32,
        payment_mode: PaymentMode,
        installment_count: u32,
    ) -> Result<(), Error> {
        let mut course: Course = env
            .storage()
            .persistent()
            .get(&DataKey::Course(course_id.clone()))
            .ok_or(Error::CourseNotFound)?;
        if course.creator != creator {
            return Err(Error::InvalidStatus);
        }
        creator.require_auth();
        if price_units <= 0 {
            return Err(Error::InvalidPrice);
        }
        if capacity == 0 || capacity < course.enrolled {
            return Err(Error::InvalidCapacity);
        }
        validate_payment(payment_mode, installment_count)?;
        course.recipient = recipient;
        course.asset = asset;
        course.price_units = price_units;
        course.capacity = capacity;
        course.payment_mode = payment_mode;
        course.installment_count = installment_count;
        course.version += 1;
        env.storage()
            .persistent()
            .set(&DataKey::Course(course_id.clone()), &course);
        env.events()
            .publish((symbol_short!("updated"), course_id), course.version);
        Ok(())
    }

    pub fn set_status(
        env: Env,
        course_id: BytesN<32>,
        creator: Address,
        status: CourseStatus,
    ) -> Result<(), Error> {
        let mut course: Course = env
            .storage()
            .persistent()
            .get(&DataKey::Course(course_id.clone()))
            .ok_or(Error::CourseNotFound)?;
        if course.creator != creator {
            return Err(Error::InvalidStatus);
        }
        creator.require_auth();
        course.status = status;
        course.version += 1;
        env.storage()
            .persistent()
            .set(&DataKey::Course(course_id.clone()), &course);
        env.events()
            .publish((symbol_short!("status"), course_id), course.version);
        Ok(())
    }

    pub fn record_purchase(
        env: Env,
        registrar: Address,
        course_id: BytesN<32>,
        student: Address,
        payment_reference: BytesN<32>,
        payment_number: u32,
    ) -> Result<(), Error> {
        require_registrar(&env, &registrar)?;
        let mut course: Course = env
            .storage()
            .persistent()
            .get(&DataKey::Course(course_id.clone()))
            .ok_or(Error::CourseNotFound)?;
        if course.status != CourseStatus::Published {
            return Err(Error::CoursePaused);
        }
        let purchase_key = DataKey::Purchase(course_id.clone(), payment_reference.clone());
        if env.storage().persistent().has(&purchase_key) {
            return Err(Error::PaymentAlreadyRecorded);
        }
        let entitlement_key = DataKey::Entitlement(course_id.clone(), student.clone());
        let previous: Option<Entitlement> = env.storage().persistent().get(&entitlement_key);
        let next_number = previous
            .as_ref()
            .map(|value| value.payments + 1)
            .unwrap_or(1);
        if payment_number != next_number {
            return Err(Error::InvalidPaymentNumber);
        }
        match course.payment_mode {
            PaymentMode::Single if previous.is_some() => return Err(Error::AlreadyEntitled),
            PaymentMode::Installments if next_number > course.installment_count => {
                return Err(Error::InstallmentsComplete)
            }
            _ => {}
        }
        if previous.is_none() {
            if course.enrolled >= course.capacity {
                return Err(Error::CapacityReached);
            }
            course.enrolled += 1;
        }
        let entitlement = Entitlement {
            payments: next_number,
            installments_paid: if course.payment_mode == PaymentMode::Installments {
                next_number
            } else {
                0
            },
            active: true,
        };
        let purchase = Purchase {
            student: student.clone(),
            payment_reference,
            payment_number,
            recorded_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(
            &DataKey::Entitlement(course_id.clone(), student),
            &entitlement,
        );
        env.storage().persistent().set(&purchase_key, &purchase);
        env.storage()
            .persistent()
            .set(&DataKey::Course(course_id.clone()), &course);
        env.events()
            .publish((symbol_short!("purchase"), course_id), payment_number);
        Ok(())
    }

    pub fn revoke_entitlement(
        env: Env,
        course_id: BytesN<32>,
        creator: Address,
        student: Address,
    ) -> Result<(), Error> {
        let course: Course = env
            .storage()
            .persistent()
            .get(&DataKey::Course(course_id.clone()))
            .ok_or(Error::CourseNotFound)?;
        if course.creator != creator {
            return Err(Error::InvalidStatus);
        }
        creator.require_auth();
        let key = DataKey::Entitlement(course_id, student);
        let mut entitlement: Entitlement = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::EntitlementNotFound)?;
        entitlement.active = false;
        env.storage().persistent().set(&key, &entitlement);
        Ok(())
    }

    pub fn get_course(env: Env, course_id: BytesN<32>) -> Result<Course, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Course(course_id))
            .ok_or(Error::CourseNotFound)
    }

    pub fn get_entitlement(
        env: Env,
        course_id: BytesN<32>,
        student: Address,
    ) -> Option<Entitlement> {
        env.storage()
            .persistent()
            .get(&DataKey::Entitlement(course_id, student))
    }

    pub fn has_entitlement(env: Env, course_id: BytesN<32>, student: Address) -> bool {
        Self::get_entitlement(env, course_id, student)
            .map(|entitlement| entitlement.active)
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;
    use soroban_sdk::{testutils::Address as _, BytesN};

    fn id(env: &Env, value: u8) -> BytesN<32> {
        BytesN::from_array(env, &[value; 32])
    }

    #[test]
    fn records_single_payment_and_entitlement() {
        let env = Env::default();
        let contract_id = env.register(CourseRegistry, ());
        let client = CourseRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let registrar = Address::generate(&env);
        let creator = Address::generate(&env);
        let student = Address::generate(&env);
        env.mock_all_auths();
        client.initialize(&admin, &registrar);
        client.register_course(
            &id(&env, 1),
            &creator,
            &creator,
            &admin,
            &100,
            &10,
            &PaymentMode::Single,
            &0,
        );
        client.record_purchase(&registrar, &id(&env, 1), &student, &id(&env, 2), &1);
        assert!(client.has_entitlement(&id(&env, 1), &student));
        assert_eq!(client.get_course(&id(&env, 1)).enrolled, 1);
    }

    #[test]
    fn tracks_installments_without_consuming_extra_seats() {
        let env = Env::default();
        let contract_id = env.register(CourseRegistry, ());
        let client = CourseRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let registrar = Address::generate(&env);
        let creator = Address::generate(&env);
        let student = Address::generate(&env);
        env.mock_all_auths();
        client.initialize(&admin, &registrar);
        client.register_course(
            &id(&env, 4),
            &creator,
            &creator,
            &admin,
            &100,
            &1,
            &PaymentMode::Installments,
            &3,
        );
        client.record_purchase(&registrar, &id(&env, 4), &student, &id(&env, 5), &1);
        client.record_purchase(&registrar, &id(&env, 4), &student, &id(&env, 6), &2);
        assert_eq!(
            client
                .get_entitlement(&id(&env, 4), &student)
                .unwrap()
                .payments,
            2
        );
        assert_eq!(client.get_course(&id(&env, 4)).enrolled, 1);
    }
}
