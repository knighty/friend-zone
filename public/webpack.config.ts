import MiniCssExtractPlugin from "mini-css-extract-plugin";
import path from "path";
import { WebpackManifestPlugin } from 'webpack-manifest-plugin';

const isProduction = process.env.NODE_ENV == 'production';

const rules = {
    typescript: {
        test: /\.(ts|tsx)$/i,
        loader: 'ts-loader',
        exclude: ['/node_modules/'],
    },

    static: {
        test: /\.(eot|svg|ttf|woff|woff2|png|jpg|gif|wav|mp3)$/i,
        type: 'asset/resource',
        generator: {
            filename: "assets/[name].[hash][ext]",
        }
    },

    css: {
        test: /\.s[ac]ss$/i,
        use: [
            {
                loader: MiniCssExtractPlugin.loader,
                options: {
                },
            },
            "css-loader",
            "sass-loader"
        ],
    },

    ejs: {
        test: /\.ejs$/i,
        use: [
            /*{
                loader: 'ejs-compiled-loader',
            },*/
            /*{
                loader: 'apply-loader',
            },*/
            {
                loader: 'html-loader',
                options: {
                    postprocessor: (content: string, loaderContext: any) => {
                        // When you environment supports template literals (using browserslist or options) we will generate code using them
                        const isTemplateLiteralSupported = content[0] === "`";

                        const reg = new RegExp(/<%= require\('(.*)'\) %>/g);
                        content = content.replace(reg, `\${require('html-loader!$1').default}`)

                        return content;
                    },
                }
            }
        ],
    },
}

const staticDir = path.join(__dirname, "/src");
const dirs = {
    static: staticDir,
    css: path.join(staticDir, "/css"),
    js: path.join(staticDir, "/js"),
}

const config: any = {
    cache: {
        type: 'filesystem'
    },
    performance: {
        hints: false
    },
    entry: {
        main: [path.join(dirs.css, "styles.scss"), path.join(dirs.js, "index.ts")],
        dashboard: [path.join(dirs.css, "dashboard.scss"), path.join(dirs.js, "dashboard.ts")],
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: "js/[contenthash].js",
        publicPath: "/static/",
        clean: true,
    },
    plugins: [
        new WebpackManifestPlugin({}),
        new MiniCssExtractPlugin({
            filename: "css/[contenthash].css",
            chunkFilename: "[id].css",
        })
    ],
    module: {
        rules: [rules.typescript, rules.static, rules.css, rules.ejs],
    },
    optimization: {
        usedExports: true,
        moduleIds: "deterministic",
        providedExports: true,
        sideEffects: true,
        splitChunks: {
            cacheGroups: {
                styles: {
                    test: /style\.scss/,
                    name: "style",
                    type: "css/mini-extract",
                    chunks: "all",
                    enforce: true,
                },
            },
        },
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.jsx', '.js', '...'],
        fallback: {
            "fs": false,
            "path": require.resolve("path-browserify"),
        }
    },
};

module.exports = () => {
    if (isProduction) {
        config.mode = 'production';
    } else {
        config.mode = 'development';
        config.devtool = 'source-map';
    }

    return config;
};
