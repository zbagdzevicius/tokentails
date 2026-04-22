import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import fetch from 'node-fetch';

const PRINTIFY_API_BASE_URL = 'https://api.printify.com/v1';

export interface PrintifyShop {
    id: number;
    title: string;
    sales_channel: string;
}

export interface PrintifyImageUpload {
    id: string;
    file_name: string;
    height: number;
    width: number;
    size: number;
    mime_type: string;
    preview_url: string;
    upload_time: string;
}

export interface PrintifyProduct {
    id: string;
    title: string;
    description: string;
    tags: string[];
    variants: PrintifyVariant[];
    images: PrintifyProductImage[];
    created_at: string;
    updated_at: string;
    visible: boolean;
    blueprint_id: number;
    print_provider_id: number;
    user_id: number;
    shop_id: number;
    print_areas: PrintifyPrintArea[];
}

export interface PrintifyVariant {
    id: number;
    product_id: string;
    price: number;
    currency: string;
    is_enabled: boolean;
    is_default: boolean;
    is_available: boolean;
    title: string;
    options: {
        color?: string;
        size?: string;
    };
}

export interface PrintifyProductImage {
    src: string;
    variant_ids: number[];
    position: string;
    is_default: boolean;
}

export interface PrintifyPrintArea {
    variant_ids: number[];
    placeholders: PrintifyPlaceholder[];
}

export interface PrintifyPlaceholder {
    position: string;
    images: PrintifyPlaceholderImage[];
}

export interface PrintifyPlaceholderImage {
    id: string;
    name: string;
    type: string;
    height: number;
    width: number;
    x: number;
    y: number;
    scale: number;
    angle: number;
}

export interface PrintifyOrder {
    id: string;
    order_number: number;
    address_to: PrintifyAddress;
    line_items: PrintifyLineItem[];
    shipping_method: number;
    send_shipping_notification: boolean;
    metadata: Record<string, any>;
}

export interface PrintifyAddress {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    country: string;
    region: string;
    address1: string;
    address2?: string;
    city: string;
    zip: string;
}

export interface PrintifyLineItem {
    product_id: string;
    variant_id: number;
    quantity: number;
}

export interface CreateProductParams {
    shopId: number;
    blueprintId: number;
    printProviderId: number;
    title: string;
    description?: string;
    imageUrl: string;
    variantIds?: number[];
}

export interface PlaceOrderParams {
    shopId: number;
    productId: string;
    variantId: number;
    quantity: number;
    shippingAddress: PrintifyAddress;
    shippingMethod?: number;
    sendShippingNotification?: boolean;
}

@Injectable()
export class PrintifyService {
    private readonly logger = new Logger(PrintifyService.name);
    private readonly apiKey: string;
    private readonly userAgent: string = 'TokenTails-BE/1.0';

    constructor() {
        this.apiKey = process.env.PRINTIFY_API_KEY || '';
        if (!this.apiKey) {
            this.logger.warn('PRINTIFY_API_KEY is not set in environment variables');
        }
    }

    private async makeRequest<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', endpoint: string, body?: any): Promise<T> {
        if (!this.apiKey) {
            throw new BadRequestException('Printify API key is not configured');
        }

        const url = `${PRINTIFY_API_BASE_URL}${endpoint}`;
        const headers: Record<string, string> = {
            Authorization: `Bearer ${this.apiKey}`,
            'User-Agent': this.userAgent,
            'Content-Type': 'application/json',
        };

        const options: any = {
            method,
            headers,
        };

        if (body && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);
            const responseText = await response.text();

            if (!response.ok) {
                this.logger.error(`Printify API error: ${response.status} ${response.statusText} - ${responseText}`);
                throw new BadRequestException(
                    `Printify API error: ${response.status} ${response.statusText} - ${responseText}`
                );
            }

            if (responseText) {
                return JSON.parse(responseText) as T;
            }

            return {} as T;
        } catch (error) {
            this.logger.error(`Error calling Printify API: ${error}`);
            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException(`Failed to communicate with Printify API: ${error}`);
        }
    }

    /**
     * Get all shops associated with the account
     */
    async getShops(): Promise<PrintifyShop[]> {
        const response = await this.makeRequest<PrintifyShop[]>('GET', '/shops.json');
        return response;
    }

    /**
     * Get a specific shop by ID
     */
    async getShop(shopId: number): Promise<PrintifyShop> {
        const shops = await this.getShops();
        const shop = shops.find(s => s.id === shopId);
        if (!shop) {
            throw new BadRequestException(`Shop with ID ${shopId} not found`);
        }
        return shop;
    }

    /**
     * Upload an image from URL to Printify
     */
    async uploadImageFromUrl(imageUrl: string, fileName?: string): Promise<PrintifyImageUpload> {
        try {
            // First, fetch the image from the URL
            const imageResponse = await fetch(imageUrl);
            if (!imageResponse.ok) {
                throw new BadRequestException(`Failed to fetch image from URL: ${imageUrl}`);
            }

            const imageBuffer = await imageResponse.buffer();
            const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
            const finalFileName = fileName || imageUrl.split('/').pop() || 'image.jpg';

            // Create multipart form data manually for node-fetch v2
            const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2, 15)}`;
            const formDataParts: Buffer[] = [];

            // Add file_name field
            formDataParts.push(Buffer.from(`--${boundary}\r\n`));
            formDataParts.push(Buffer.from(`Content-Disposition: form-data; name="file_name"\r\n\r\n`));
            formDataParts.push(Buffer.from(`${finalFileName}\r\n`));

            // Add file field
            formDataParts.push(Buffer.from(`--${boundary}\r\n`));
            formDataParts.push(
                Buffer.from(`Content-Disposition: form-data; name="file"; filename="${finalFileName}"\r\n`)
            );
            formDataParts.push(Buffer.from(`Content-Type: ${contentType}\r\n\r\n`));
            formDataParts.push(imageBuffer);
            formDataParts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

            const formData = Buffer.concat(formDataParts);

            const url = `${PRINTIFY_API_BASE_URL}/uploads/images.json`;
            const headers: Record<string, string> = {
                Authorization: `Bearer ${this.apiKey}`,
                'User-Agent': this.userAgent,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: formData,
            });

            const responseText = await response.text();

            if (!response.ok) {
                this.logger.error(`Printify upload error: ${response.status} ${response.statusText} - ${responseText}`);
                throw new BadRequestException(
                    `Failed to upload image to Printify: ${response.status} ${response.statusText} - ${responseText}`
                );
            }

            return JSON.parse(responseText) as PrintifyImageUpload;
        } catch (error) {
            this.logger.error(`Error uploading image: ${error}`);
            if (error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException(`Failed to upload image: ${error}`);
        }
    }

    /**
     * Create a product with an uploaded image
     */
    async createProduct(params: CreateProductParams): Promise<PrintifyProduct> {
        const { shopId, blueprintId, printProviderId, title, description, imageUrl, variantIds } = params;

        // First, upload the image
        const uploadedImage = await this.uploadImageFromUrl(imageUrl);

        // Get blueprint details to understand available variants
        const catalogResponse = await this.makeRequest<any>(
            'GET',
            `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`
        );

        // Use provided variantIds or default to first available variant
        const availableVariants = catalogResponse.variants || [];
        const selectedVariantIds = variantIds || (availableVariants.length > 0 ? [availableVariants[0].id] : []);

        if (selectedVariantIds.length === 0) {
            throw new BadRequestException('No variants available for this blueprint and print provider');
        }

        // Get variant details to understand print areas
        let printAreas: any[] = [];
        try {
            const variantDetails = await this.makeRequest<any>(
                'GET',
                `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants/${selectedVariantIds[0]}.json`
            );

            // Build print areas based on variant details
            if (variantDetails.print_areas && Array.isArray(variantDetails.print_areas)) {
                printAreas = variantDetails.print_areas.map((printArea: any) => ({
                    variant_ids: selectedVariantIds,
                    placeholders: printArea.placeholders?.map((placeholder: any) => ({
                        position: placeholder.position || 'front',
                        images: [
                            {
                                id: uploadedImage.id,
                                x: 0.5,
                                y: 0.5,
                                scale: 1,
                                angle: 0,
                            },
                        ],
                    })) || [
                        {
                            position: 'front',
                            images: [
                                {
                                    id: uploadedImage.id,
                                    x: 0.5,
                                    y: 0.5,
                                    scale: 1,
                                    angle: 0,
                                },
                            ],
                        },
                    ],
                }));
            } else {
                // Default print area if none found
                printAreas = [
                    {
                        variant_ids: selectedVariantIds,
                        placeholders: [
                            {
                                position: 'front',
                                images: [
                                    {
                                        id: uploadedImage.id,
                                        x: 0.5,
                                        y: 0.5,
                                        scale: 1,
                                        angle: 0,
                                    },
                                ],
                            },
                        ],
                    },
                ];
            }
        } catch (error) {
            this.logger.warn(`Could not fetch variant details, using default print area: ${error}`);
            // Default print area if we can't fetch variant details
            printAreas = [
                {
                    variant_ids: selectedVariantIds,
                    placeholders: [
                        {
                            position: 'front',
                            images: [
                                {
                                    id: uploadedImage.id,
                                    x: 0.5,
                                    y: 0.5,
                                    scale: 1,
                                    angle: 0,
                                },
                            ],
                        },
                    ],
                },
            ];
        }

        // Build the product creation payload
        const productData = {
            title: title,
            description: description || '',
            blueprint_id: blueprintId,
            print_provider_id: printProviderId,
            variants: selectedVariantIds.map((variantId: number) => {
                const variant = availableVariants.find((v: any) => v.id === variantId);
                return {
                    id: variantId,
                    price: variant?.price || 0,
                    is_enabled: true,
                };
            }),
            print_areas: printAreas,
        };

        const product = await this.makeRequest<PrintifyProduct>('POST', `/shops/${shopId}/products.json`, productData);

        return product;
    }

    /**
     * Publish a product to the shop
     */
    async publishProduct(shopId: number, productId: string): Promise<void> {
        await this.makeRequest('POST', `/shops/${shopId}/products/${productId}/publish.json`, {
            title: true,
            description: true,
            images: true,
            variants: true,
            tags: true,
        });
    }

    /**
     * Place an order for a product
     */
    async placeOrder(params: PlaceOrderParams): Promise<PrintifyOrder> {
        const {
            shopId,
            productId,
            variantId,
            quantity,
            shippingAddress,
            shippingMethod,
            sendShippingNotification = false,
        } = params;

        const orderData = {
            line_items: [
                {
                    product_id: productId,
                    variant_id: variantId,
                    quantity: quantity,
                },
            ],
            shipping_method: shippingMethod || 1, // Default to standard shipping
            send_shipping_notification: sendShippingNotification,
            address_to: shippingAddress,
        };

        const order = await this.makeRequest<PrintifyOrder>('POST', `/shops/${shopId}/orders.json`, orderData);

        return order;
    }

    /**
     * Get order details
     */
    async getOrder(shopId: number, orderId: string): Promise<PrintifyOrder> {
        return this.makeRequest<PrintifyOrder>('GET', `/shops/${shopId}/orders/${orderId}.json`);
    }

    /**
     * Get all orders for a shop
     */
    async getOrders(shopId: number): Promise<PrintifyOrder[]> {
        const response = await this.makeRequest<PrintifyOrder[]>('GET', `/shops/${shopId}/orders.json`);
        return response;
    }
}
