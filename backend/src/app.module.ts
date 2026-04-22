import { Module } from '@nestjs/common';
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
import { CatController } from './cat/cat.controller';
import { CatRepository } from './cat/cat.repository';
import { Cat, CatSchema } from './cat/cat.schema';
import { CatService } from './cat/cat.service';
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
import { FirebaseAdminModule } from './user/firebase-admin.module';
import { AuthStrategy } from './user/strategies/auth-app.strategy';
import { UserController } from './user/user.controller';
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
    private_key: process.env.FB_PRIVATE_KEY,
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
        ThrottlerModule.forRoot([
            {
                ttl: 60000, // 1 minute in milliseconds
                limit: 5, // 5 requests per minute
            },
        ]),
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
        ]),
        FirebaseAdminModule.forRoot(config as any),
        ...JwtModules,
    ],
    controllers: [
        AppController,
        UserController,
        ArticleController,
        CategoryController,
        ImageController,
        FeedController,
        CommentController,
        CatController,
        Web3Controller,
        BlessingController,
        ShelterController,
        QuestController,
        TicketController,
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
        GameRepository,
        QuestRepository,
        TicketRepository,
        PrintifyService,
    ],
})
export class AppModule {}
