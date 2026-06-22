import os
from typing import Generator
from datetime import datetime

from dotenv import load_dotenv
from sqlmodel import Session, SQLModel, create_engine, select
from sqlalchemy.exc import OperationalError

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://wealth_user:WealthTrack_Prod_2026@localhost:5432/wealth_tracker",
)

# Test connection to see if postgres is online
try:
    engine = create_engine(DATABASE_URL, echo=False, connect_args={"connect_timeout": 2})
    # Force a connection attempt to trigger OperationalError if offline
    with engine.connect() as conn:
        pass
except (OperationalError, Exception) as e:
    print("PostgreSQL connection failed. Falling back to SQLite for local development.")
    DATABASE_URL = "sqlite:///wealth_tracker.db"
    engine = create_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False})



def seed_superadmin(session: Session) -> None:
    from app.models.models import User, Subscription, SubscriptionTier, SubscriptionStatus
    
    # Check if user already exists
    email = "admin@astradigital.com.au"
    superadmin = session.exec(select(User).where(User.email == email)).first()
    
    if not superadmin:
        superadmin = User(
            email=email,
            clerk_user_id="user_AstraAdminClerk2026",
            display_name="Astra",
            is_superadmin=True,
            has_completed_onboarding=True,
            created_at=datetime.utcnow(),
            is_active=True
        )
        session.add(superadmin)
        session.flush() # get the ID
        
        # Create subscription
        sub = Subscription(
            user_id=superadmin.id,
            tier=SubscriptionTier.ENTERPRISE,
            status=SubscriptionStatus.ACTIVE,
            stripe_customer_id="cust_mock_astra",
            stripe_subscription_id="sub_mock_astra",
            updated_at=datetime.utcnow()
        )
        session.add(sub)
        session.commit()
        print("Superadmin user Astra successfully seeded with Enterprise plan.")
    else:
        # Ensure it has is_superadmin and enterprise tier
        superadmin.is_superadmin = True
        superadmin.has_completed_onboarding = True
        session.add(superadmin)
        
        sub = session.exec(select(Subscription).where(Subscription.user_id == superadmin.id)).first()
        if not sub:
            sub = Subscription(
                user_id=superadmin.id,
                tier=SubscriptionTier.ENTERPRISE,
                status=SubscriptionStatus.ACTIVE,
                updated_at=datetime.utcnow()
            )
            session.add(sub)
        else:
            sub.tier = SubscriptionTier.ENTERPRISE
            sub.status = SubscriptionStatus.ACTIVE
            session.add(sub)
        session.commit()


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed_superadmin(session)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session

