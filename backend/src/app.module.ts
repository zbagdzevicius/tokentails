import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { ArticleController } from './article/article.controller';
import { ArticleRepository } from './article/article.repository';
import { Article, ArticleSchema } from './article/article.schema';
import { BlessingController } from './blessing/blessing.controller';
import { BlessingRepository } from './blessing/blessing.repository';
import { Blessing, BlessingSchema } from './blessing/blessing.schema';
import { FeaturedBlessingService } from './blessing/featured.service';
import { CatController } from './cat/cat.controller';
import { CatRepository } from './cat/cat.repository';
import { Cat, CatSchema } from './cat/cat.schema';
import { CatService } from './cat/cat.service';
import { CatStakingService } from './cat/cat-staking.service';
import { CatNameService } from './cat/cat-name.service';
import { NameReportRepository } from './cat/name-report.repository';
import { NameReport, NameReportSchema } from './cat/name-report.schema';
import { CategoryController } from './category/category.controller';
import { CategoryRepository } from './category/category.repository';
import { Category, CategorySchema } from './category/category.schema';
import { CommentController } from './comment/comment.controller';
import { CommentRepository } from './comment/comment.repository';
import { Comment, CommentSchema } from './comment/comment.schema';
import { FeedController } from './feed/feed.controller';
import { GameRepository } from './game/game.repository';
import { Game, GameSchema } from './game/game.schema';
import { ImageController } from './image/image.controller';
import { ImageRepository } from './image/image.repository';
import { Image, ImageSchema } from './image/image.schema';
import { EncryptionService } from './shared/encryption.service';
import { ShelterController } from './shelter/shelter.controller';
import { ShelterRepository } from './shelter/shelter.repository';
import { Shelter, ShelterSchema } from './shelter/shelter.schema';
import { ShelterChain } from './shelter/onchain/shelter-chain';
import { ShelterDonateService } from './shelter/onchain/shelter-donate.service';
import { ShelterOnchainController } from './shelter/onchain/shelter-onchain.controller';
import {
    ShelterDonateDay,
    ShelterDonateDaySchema,
    ShelterDonation,
    ShelterDonationSchema,
    X402Nonce,
    X402NonceSchema,
    X402UsedTx,
    X402UsedTxSchema,
    ShelterRelayTx,
    ShelterRelayTxSchema,
    ShelterMatch,
    ShelterMatchSchema,
    ShelterClaim,
    ShelterClaimSchema,
    ShelterCounter,
    ShelterCounterSchema,
    ShelterRouterScan,
    ShelterRouterScanSchema,
} from './shelter/onchain/shelter-onchain.schema';
import { ShelterRelayService } from './shelter/onchain/shelter-relay.service';
import { ShelterMatchService } from './shelter/onchain/shelter-match.service';
import { ShelterClaimService } from './shelter/onchain/shelter-claim.service';
import { ShelterX402Service } from './shelter/onchain/shelter-x402.service';
import { ShelterDonateReconcileService } from './shelter/onchain/shelter-donate-reconcile.service';
import { ImpactAdminController } from './impact/impact-admin.controller';
import { ImpactController } from './impact/impact.controller';
import { ImpactEligibilityService } from './impact/eligibility.service';
import { ImpactIndexerService } from './impact/impact-indexer.service';
import { ImpactService } from './impact/impact.service';
import {
    ImpactChainCursor,
    ImpactChainCursorSchema,
    ImpactSnapshot,
    ImpactSnapshotSchema,
    ShelterPayoutEvent,
    ShelterPayoutEventSchema,
} from './impact/impact.schema';
import {
    ShelterOutcome,
    ShelterOutcomeImage,
    ShelterOutcomeImageSchema,
    ShelterOutcomeSchema,
} from './impact/outcome.schema';
import { ShelterOutcomeService } from './impact/outcomes.service';
import { Paw, PawSchema, PawSettlement, PawSettlementSchema } from './impact/paws.schema';
import { PawSettlementService } from './impact/paws.service';
import { ImpactPayout, ImpactPayoutSchema } from './impact/payout.schema';
import { ImpactPayoutService } from './impact/payouts.service';
import { PledgeService } from './impact/pledge.service';
import { RescueGoalController } from './rescue-goal/rescue-goal.controller';
import { RescueGoalPledgeService } from './rescue-goal/rescue-goal-pledge.service';
import {
    RescueGoal,
    RescueGoalHelper,
    RescueGoalHelperSchema,
    RescueGoalPledge,
    RescueGoalPledgeDay,
    RescueGoalPledgeDaySchema,
    RescueGoalPledgeSchema,
    RescueGoalReceipt,
    RescueGoalReceiptSchema,
    RescueGoalSchema,
} from './rescue-goal/rescue-goal.schema';
import { RescueGoalService } from './rescue-goal/rescue-goal.service';
import { RescueGoalStore } from './rescue-goal/rescue-goal.store';
import { ShelterMembersService } from './shelter/shelter-members.service';
import { UserThrottlerGuard } from './shared/guards/user-throttler.guard';
import { FirebaseAdminModule } from './user/firebase-admin.module';
import { AuthStrategy } from './user/strategies/auth-app.strategy';
import { UserController } from './user/user.controller';
import { StarterController } from './user/starter.controller';
import { UserRepository } from './user/user.repository';
import { User, UserSchema } from './user/user.schema';
import { UserService } from './user/user.service';
import { OrderRepository } from './web3/order.repository';
import { Order, OrderSchema } from './web3/order.schema';
import { Web3Controller } from './web3/web3.controller';
import { Quest, QuestSchema } from './quest/quest.schema';
import { QuestRepository } from './quest/quest.repository';
import { QuestController } from './quest/quest.controller';
import { Web3Service } from './web3/web3.service';
import { Ticket, TicketSchema } from './ticket/ticket.schema';
import { TicketController } from './ticket/ticket.controller';
import { TicketRepository } from './ticket/ticket.repository';
import { PrintifyService } from './printify/printify.service';
import { StripePaymentService } from './payments/stripe-payment.service';
import { AppThrottlerGuard, DEFAULT_THROTTLE } from './shared/guards/app-throttler.guard';

const JwtModules = [
    PassportModule,
    PassportModule.register({
        defaultStrategy: 'appauth',
        property: 'user',
        session: true,
    }),
];
const config = {
    type: 'service_account',
    project_id: 'news-ccd33',
    private_key_id: 'e11a95ac3ae99911a3939f56758c44c335067d68',
    private_key: (process.env.FB_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    client_email: 'firebase-adminsdk-yyfh7@news-ccd33.iam.gserviceaccount.com',
    client_id: '105843627783724843135',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url:
        'https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-yyfh7%40news-ccd33.iam.gserviceaccount.com',
};

@Module({
    imports: [
        ScheduleModule.forRoot(),
        // Applied to every route by the APP_GUARD below; routes tighten it with @Throttle.
        ThrottlerModule.forRoot([DEFAULT_THROTTLE]),
        MongooseModule.forRoot(process.env.MONGODB_URI!, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        }),
        MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: Article.name, schema: ArticleSchema },
            { name: Category.name, schema: CategorySchema },
            { name: Image.name, schema: ImageSchema },
            { name: Comment.name, schema: CommentSchema },
            { name: Cat.name, schema: CatSchema },
            { name: Order.name, schema: OrderSchema },
            { name: Blessing.name, schema: BlessingSchema },
            { name: Shelter.name, schema: ShelterSchema },
            { name: Game.name, schema: GameSchema },
            { name: Quest.name, schema: QuestSchema },
            { name: Ticket.name, schema: TicketSchema },
            { name: ShelterDonation.name, schema: ShelterDonationSchema },
            { name: ShelterDonateDay.name, schema: ShelterDonateDaySchema },
            { name: X402Nonce.name, schema: X402NonceSchema },
            { name: X402UsedTx.name, schema: X402UsedTxSchema },
            { name: ShelterRelayTx.name, schema: ShelterRelayTxSchema },
            { name: ShelterMatch.name, schema: ShelterMatchSchema },
            { name: ShelterClaim.name, schema: ShelterClaimSchema },
            { name: ShelterCounter.name, schema: ShelterCounterSchema },
            { name: ShelterRouterScan.name, schema: ShelterRouterScanSchema },
            { name: ShelterPayoutEvent.name, schema: ShelterPayoutEventSchema },
            { name: ImpactChainCursor.name, schema: ImpactChainCursorSchema },
            { name: ImpactSnapshot.name, schema: ImpactSnapshotSchema },
            { name: Paw.name, schema: PawSchema },
            { name: PawSettlement.name, schema: PawSettlementSchema },
            { name: ImpactPayout.name, schema: ImpactPayoutSchema },
            { name: ShelterOutcome.name, schema: ShelterOutcomeSchema },
            { name: ShelterOutcomeImage.name, schema: ShelterOutcomeImageSchema },
            { name: NameReport.name, schema: NameReportSchema },
            { name: RescueGoal.name, schema: RescueGoalSchema },
            { name: RescueGoalPledge.name, schema: RescueGoalPledgeSchema },
            { name: RescueGoalPledgeDay.name, schema: RescueGoalPledgeDaySchema },
            { name: RescueGoalHelper.name, schema: RescueGoalHelperSchema },
            { name: RescueGoalReceipt.name, schema: RescueGoalReceiptSchema },
        ]),
        FirebaseAdminModule.forRoot(config as any),
        ...JwtModules,
    ],
    controllers: [
        AppController,
        UserController,
        StarterController,
        ArticleController,
        CategoryController,
        ImageController,
        FeedController,
        CommentController,
        CatController,
        Web3Controller,
        BlessingController,
        // Before ShelterController: its GET /shelter/:id would otherwise answer GET /shelter/claim.
        ShelterOnchainController,
        ShelterController,
        QuestController,
        TicketController,
        ImpactController,
        ImpactAdminController,
        RescueGoalController,
    ],
    providers: [
        UserRepository,
        ArticleRepository,
        CategoryRepository,
        UserService,
        Web3Service,
        ImageRepository,
        CommentRepository,
        AuthStrategy,
        CatRepository,
        OrderRepository,
        BlessingRepository,
        ShelterRepository,
        EncryptionService,
        CatService,
        CatStakingService,
        CatNameService,
        NameReportRepository,
        FeaturedBlessingService,
        GameRepository,
        QuestRepository,
        TicketRepository,
        PrintifyService,
        StripePaymentService,
        ShelterChain,
        ShelterDonateService,
        ShelterX402Service,
        ShelterRelayService,
        ShelterMatchService,
        ShelterClaimService,
        ShelterDonateReconcileService,
        ImpactEligibilityService,
        ImpactIndexerService,
        ImpactService,
        PawSettlementService,
        ImpactPayoutService,
        ShelterOutcomeService,
        PledgeService,
        RescueGoalStore,
        RescueGoalPledgeService,
        RescueGoalService,
        ShelterMembersService,
        UserThrottlerGuard,
        { provide: APP_GUARD, useClass: AppThrottlerGuard },
    ],
})
export class AppModule {}
