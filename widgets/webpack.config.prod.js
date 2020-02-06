/*
 * Copyright © 2020 ThingsBoard
 */
/* eslint-disable */

const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CompressionPlugin = require('compression-webpack-plugin');

const webpack = require('webpack');
const path = require('path');

const PUBLIC_RESOURCE_PATH = '/';

module.exports = {
    mode: 'production',
    entry: [
        './src/app/widget/lib/thingsboardExtension/index.js'
    ],
    output: {
        path: path.resolve(__dirname, 'target/generated-resources/public/static'),
        publicPath: '/static/',
        filename: 'thingsboard-extension-widgets.js'
    },
    externals: {
        "jquery": "jQuery",
        "moment": "moment"
    },
    plugins: [
        new webpack.ProvidePlugin({
            // $: "jquery",
            // jQuery: "jquery",
            // "window.jQuery": "jquery"
            // tinycolor: "tinycolor2",
            // tv4: "tv4",
            // moment: "moment"
        }),
        new MiniCssExtractPlugin({
            filename: 'thingsboard-extension-style.css'
        }),
        new webpack.DefinePlugin({
            '__DEVTOOLS__': false,
            PUBLIC_PATH: PUBLIC_RESOURCE_PATH
        }),
        new CompressionPlugin({
            filename: "[path].gz[query]",
            algorithm: "gzip",
            test: /\.js$|\.css$|\.svg$|\.ttf$|\.woff$|\.woff2$|\.eot$|\.json$/,
            threshold: 10240,
            minRatio: 0.8
        })
    ],
    node: {
        tls: "empty",
        fs: "empty"
    },
    module: {
        rules: [
            {
                test: /\.jsx$/,
                use: [
                    {
                        loader: 'babel-loader',
                        options: {
                            cacheDirectory: true
                        }
                    }
                ],
                exclude: /node_modules/,
                include: __dirname
            },
            {
                test: /\.js$/,
                use: [
                    {
                        loader: 'ng-annotate-loader',
                        options: {
                            ngAnnotate: 'ng-annotate-patched',
                            es6: true,
                            explicitOnly: false
                        }
                    },
                    {
                        loader: 'babel-loader',
                        options: {
                            cacheDirectory: true
                        }
                    }
                ],
                exclude: /node_modules/,
                include: __dirname
            },
            {
                test: /\.js$/,
                use: [
                    {
                        loader: 'eslint-loader',
                        options: {
                            parser: 'babel-eslint'
                        }
                    }
                ],
                exclude: /node_modules|vendor/,
                include: __dirname
            },
            {
                test: /\.css$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader'
                ]
            },
            {
                test: /\.scss$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader',
                    'postcss-loader',
                    'sass-loader'
                ]
            },
            {
                test: /\.less$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader',
                    'postcss-loader',
                    'less-loader'
                ]
            },
            {
                test: /\.tpl\.html$/,
                use: [
                    {
                        loader: 'html-loader'
                    },
                    {
                        loader: 'html-minifier-loader',
                        options: {
                            caseSensitive: true,
                            removeComments: true,
                            collapseWhitespace: false,
                            preventAttributesEscaping: true,
                            removeEmptyAttributes: false
                        }
                    }
                ]
            },
            {
                test: /\.(svg)(\?v=[0-9]+\.[0-9]+\.[0-9]+)?$/,
                use: [
                    {
                        loader: 'url-loader',
                        options: {
                            limit: 8192
                        }
                    }
                ]
            },
            {
                test: /\.(png|jpe?g|gif|woff|woff2|ttf|otf|eot|ico)(\?v=[0-9]+\.[0-9]+\.[0-9]+)?$/,
                use: [
                    {
                        loader: 'url-loader',
                        options: {
                            limit: 8192
                        }
                    },
                    {
                        loader: 'img-loader',
                        options: {
                            minimize: true
                        }
                    }
                ]
            }
        ]
    }
};
